/* Painel do desenvolvedor · Ninho — só números agregados e anônimos. */
(() => {
  'use strict';
  const raiz = document.getElementById('raiz');
  const tip = document.getElementById('tooltip');
  let estado = { admin: null, dias: lerPref('dias', 30), dados: null, timer: null, carregadoEm: 0 };

  /* ---------------- utilidades ---------------- */
  function lerPref(k, padrao) { try { const v = localStorage.getItem(`painel-${k}`); return v ? JSON.parse(v) : padrao; } catch { return padrao; } }
  function gravarPref(k, v) { try { localStorage.setItem(`painel-${k}`, JSON.stringify(v)); } catch { /* sem storage */ } }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, c = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: c }));
  const pctf = (a, b, c = 0) => (b ? `${fmt((a / b) * 100, c)}%` : '–');
  const diaCurto = (d) => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };
  const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
  const haQuanto = (iso) => {
    if (!iso) return 'nunca';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`; if (m < 1440) return `há ${Math.round(m / 60)} h`; return `há ${Math.round(m / 1440)} dias`;
  };
  function delta(a, b, { invertido = false } = {}) {
    if (!b) return '<span class="delta igual">sem base</span>';
    const v = a / b - 1;
    if (Math.abs(v) < 0.03) return '<span class="delta igual">= estável</span>';
    const bom = invertido ? v < 0 : v > 0;
    return `<span class="delta ${bom ? 'sobe' : 'desce'}">${v > 0 ? '▲' : '▼'} ${fmt(Math.abs(v) * 100)}%</span>`;
  }
  async function api(path, opt = {}) {
    const r = await fetch(`./api${path}`, { ...opt, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-painel': '1', ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Falha de comunicação.'); e.status = r.status; throw e; }
    return j;
  }

  /* ---------------- tooltip ---------------- */
  function mostrarTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, ev.clientX + 12);
    const y = Math.max(8, ev.clientY - tip.offsetHeight - 12);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  }
  const esconderTip = () => { tip.hidden = true; };
  document.addEventListener('scroll', esconderTip, { passive: true });

  /* ---------------- gráficos (SVG, uma escala, marcas finas) ---------------- */
  function escalaY(max) {
    const bruto = Math.max(1, max) / 4;
    const p = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= bruto) || bruto;
    return { passo, topo: passo * 4 };
  }
  /** Barras verticais com tooltip por barra. dados: [{rotulo, v, dica}] */
  /** Largura real do contêiner: o SVG desenha 1:1, então o texto fica sempre em 11px. */
  const larguraDe = (el) => Math.max(280, Math.round(el.getBoundingClientRect().width) || 640);
  const rotulosPara = (W) => Math.max(3, Math.floor(W / 70));
  function barras(el, dados, { cor = 'var(--s1)', altura = 180, formato = (v) => fmt(v), rotuloA } = {}) {
    const W = larguraDe(el); rotuloA = rotuloA ?? rotulosPara(W); const H = altura; const m = { l: 36, r: 6, t: 8, b: 22 };
    const { passo, topo } = escalaY(Math.max(...dados.map((d) => d.v), 0));
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const slot = iw / Math.max(1, dados.length); const bw = Math.max(2, Math.min(28, slot - 2));
    const y = (v) => m.t + ih - (v / topo) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">`;
    for (let v = 0; v <= topo + 1e-9; v += passo) s += `<line class="grade-l" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="rotulo" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${formato(v)}</text>`;
    dados.forEach((d, i) => {
      const x = m.l + slot * i + (slot - bw) / 2; const h = Math.max(0, ih - (y(d.v) - m.t));
      const r = Math.min(4, bw / 2, h);
      if (h > 0) s += `<path d="M${x},${m.t + ih} V${y(d.v) + r} Q${x},${y(d.v)} ${x + r},${y(d.v)} H${x + bw - r} Q${x + bw},${y(d.v)} ${x + bw},${y(d.v) + r} V${m.t + ih} Z" style="fill:${cor}"/>`;
      s += `<rect x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ih}" fill="transparent" data-i="${i}"/>`;
      if (dados.length <= rotuloA || i % Math.ceil(dados.length / rotuloA) === 0) s += `<text class="rotulo" x="${m.l + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
    });
    s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
    el.innerHTML = s;
    el.querySelectorAll('rect[data-i]').forEach((r) => {
      r.addEventListener('mousemove', (ev) => { const d = dados[r.dataset.i]; mostrarTip(d.dica || `${esc(d.rotulo)}: <b>${formato(d.v)}</b>`, ev); });
      r.addEventListener('mouseleave', esconderTip);
    });
  }
  /** Linha com área suave e cursor que mostra o ponto mais próximo. */
  function linha(el, dados, { cor = 'var(--s1)', altura = 180, formato = (v) => fmt(v), rotuloA, maxFixo } = {}) {
    const W = larguraDe(el); rotuloA = rotuloA ?? rotulosPara(W); const H = altura; const m = { l: 36, r: 10, t: 10, b: 22 };
    const { passo, topo } = escalaY(maxFixo ?? Math.max(...dados.map((d) => d.v ?? 0), 0));
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const x = (i) => m.l + (dados.length <= 1 ? iw / 2 : (i / (dados.length - 1)) * iw);
    const y = (v) => m.t + ih - (Math.min(v, topo) / topo) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de linha">`;
    for (let v = 0; v <= topo + 1e-9; v += passo) s += `<line class="grade-l" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="rotulo" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${formato(v)}</text>`;
    const pts = dados.map((d, i) => (d.v == null ? null : [x(i), y(d.v)])).filter(Boolean);
    if (pts.length) {
      s += `<path d="M${pts[0][0]},${m.t + ih} ${pts.map((p) => `L${p[0]},${p[1]}`).join(' ')} L${pts[pts.length - 1][0]},${m.t + ih} Z" style="fill:${cor}" opacity="0.12"/>`;
      s += `<path d="M${pts.map((p) => `${p[0]},${p[1]}`).join(' L')}" style="fill:none;stroke:${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const u = pts[pts.length - 1];
      s += `<circle cx="${u[0]}" cy="${u[1]}" r="4" style="fill:${cor};stroke:var(--surface)" stroke-width="2"/>`;
    }
    dados.forEach((d, i) => { if (dados.length <= rotuloA || i % Math.ceil(dados.length / rotuloA) === 0) s += `<text class="rotulo" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`; });
    s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/><line class="cursor" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--axis)" stroke-dasharray="3 3" visibility="hidden"/><circle class="ponto" r="5" style="fill:${cor};stroke:var(--surface)" stroke-width="2" visibility="hidden"/>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="alvo"/></svg>`;
    el.innerHTML = s;
    const svg = el.querySelector('svg'); const cur = svg.querySelector('.cursor'); const pt = svg.querySelector('.ponto');
    svg.querySelector('.alvo').addEventListener('mousemove', (ev) => {
      const b = svg.getBoundingClientRect(); const px = ((ev.clientX - b.left) / b.width) * W;
      const i = Math.max(0, Math.min(dados.length - 1, Math.round(((px - m.l) / iw) * (dados.length - 1))));
      const d = dados[i]; if (d.v == null) return;
      cur.setAttribute('x1', x(i)); cur.setAttribute('x2', x(i)); cur.setAttribute('visibility', 'visible');
      pt.setAttribute('cx', x(i)); pt.setAttribute('cy', y(d.v)); pt.setAttribute('visibility', 'visible');
      mostrarTip(d.dica || `${esc(d.rotulo)}: <b>${formato(d.v)}</b>`, ev);
    });
    svg.querySelector('.alvo').addEventListener('mouseleave', () => { esconderTip(); cur.setAttribute('visibility', 'hidden'); pt.setAttribute('visibility', 'hidden'); });
  }
  function hlista(linhas, chave, total) {
    if (!linhas.length) return '<p class="vazio">Sem dados no período.</p>';
    const max = Math.max(...linhas.map((l) => l.n));
    return `<div class="hlista">${linhas.map((l) => `<div class="hl"><span class="nome ${l.agrupado ? 'agrupado' : ''}" title="${esc(l[chave])}">${esc(l[chave])}</span><span class="trilho"><span class="barra" style="width:${(l.n / max) * 100}%;${l.agrupado ? 'opacity:.45' : ''}"></span></span><span class="v">${fmt(l.n)}${total ? ` · ${pctf(l.n, total)}` : ''}</span></div>`).join('')}</div>`;
  }
  const tabelaDe = (cab, linhas) => `<details class="tabela"><summary>Ver como tabela</summary><div class="tab"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

  /* ---------------- telas de acesso ---------------- */
  function telaAcesso(configurado) {
    raiz.innerHTML = `
      <div class="entrada"><form id="f" novalidate>
        <div class="marca"><span class="logo" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 14h3V8H2zM6.5 14h3V3h-3zM11 14h3V9.5h-3z" fill="#fff"/></svg></span><h1>Painel do desenvolvedor · Ninho</h1></div>
        <p class="muted">${configurado ? 'Acesso restrito à equipe. Dados exibidos apenas de forma agregada e anônima.' : 'Primeiro acesso: crie a conta do administrador principal com o <b>código de configuração</b> (fica no banco de dados, tabela <i>secrets</i>, chave <i>painel_setup</i>).'}</p>
        ${configurado ? '' : '<label>Código de configuração<input id="codigo" autocomplete="off" required></label><label>Seu nome<input id="nome" autocomplete="name" required></label>'}
        <label>E-mail<input id="email" type="email" autocomplete="username" required></label>
        <label>Senha<input id="senha" type="password" autocomplete="${configurado ? 'current-password' : 'new-password'}" ${configurado ? '' : 'minlength="10"'} required>${configurado ? '' : '<span class="faint">Mínimo de 10 caracteres.</span>'}</label>
        <p class="erro" id="erro" hidden></p>
        <button class="btn prim" type="submit">${configurado ? 'Entrar' : 'Criar acesso e entrar'}</button>
      </form></div>`;
    const f = document.getElementById('f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const er = document.getElementById('erro'); er.hidden = true;
      const v = (id) => (document.getElementById(id)?.value ?? '').trim();
      try {
        const r = configurado
          ? await api('/login', { method: 'POST', body: JSON.stringify({ email: v('email'), senha: document.getElementById('senha').value }) })
          : await api('/setup', { method: 'POST', body: JSON.stringify({ codigo: v('codigo'), nome: v('nome'), email: v('email'), senha: document.getElementById('senha').value }) });
        estado.admin = r.admin; montarPainel();
      } catch (x) { er.textContent = x.message; er.hidden = false; }
    });
  }

  /* ---------------- painel (navegação lateral por seções) ---------------- */
  const SECOES = [
    { id: 'geral', nome: 'Visão geral', ic: '<path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z"/>', pergunta: 'Como o app está hoje e o que pede atenção?' },
    { id: 'crescimento', nome: 'Crescimento e ativação', curto: 'Crescimento', ic: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', pergunta: 'Quantos chegam e quantos realmente começam a usar?' },
    { id: 'engajamento', nome: 'Engajamento e retenção', curto: 'Engajamento', ic: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>', pergunta: 'As famílias usam no dia a dia e continuam usando?' },
    { id: 'local', nome: 'Localização', ic: '<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>', pergunta: 'Em quais países, estados e cidades estão os usuários?' },
    { id: 'aparelhos', nome: 'Aparelhos', ic: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>', pergunta: 'Em quais aparelhos as pessoas se cadastram e usam?' },
    { id: 'notificacoes', nome: 'Notificações', ic: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', pergunta: 'Os avisos estão chegando e sendo abertos?' },
    { id: 'estabilidade', nome: 'Estabilidade', ic: '<path d="M3 12h4l2-6 4 12 2-6h6"/>', pergunta: 'O servidor está rápido e respondendo bem?' },
    { id: 'erros', nome: 'Erros', ic: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>', pergunta: 'O que está falhando, onde e com que frequência?' },
    { id: 'sistema', nome: 'Sistema', ic: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>', pergunta: 'Rotinas automáticas, versão e volume do banco.' },
  ];
  const svgIc = (p) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const secaoAtual = () => { const h = location.hash.slice(1); return SECOES.some((s) => s.id === h) ? h : lerPref('secao', 'geral'); };

  function montarPainel() {
    raiz.innerHTML = `
      <header class="topo"><div class="in">
        <div class="marca"><span class="logo" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 14h3V8H2zM6.5 14h3V3h-3zM11 14h3V9.5h-3z" fill="#fff"/></svg></span><div><h1>Painel Ninho</h1><p class="faint" id="atualizado">–</p></div></div>
        <div class="seg" role="group" aria-label="Período">${[7, 30, 90].map((d) => `<button type="button" data-dias="${d}" aria-pressed="${estado.dias === d}">${d} dias</button>`).join('')}</div>
        <button class="btn" id="atualizar" type="button">Atualizar</button>
        <button class="btn" id="conta" type="button">${esc(estado.admin.nome.split(' ')[0])} ▾</button>
      </div></header>
      <div class="casca">
        <nav class="lateral" aria-label="Seções do painel">
          ${SECOES.map((s) => `<a href="#${s.id}" data-sec="${s.id}">${svgIc(s.ic)}<span title="${s.nome}">${s.curto || s.nome}</span><i class="contador" data-cont="${s.id}" hidden></i></a>`).join('')}
          <p class="faint lateral-nota">🔒 Só números agregados e anônimos.</p>
        </nav>
        <main id="conteudo"><p class="carregando">Carregando números…</p></main>
      </div>`;
    raiz.querySelectorAll('[data-dias]').forEach((b) => b.addEventListener('click', () => {
      estado.dias = Number(b.dataset.dias); gravarPref('dias', estado.dias);
      raiz.querySelectorAll('[data-dias]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      carregar();
    }));
    document.getElementById('atualizar').addEventListener('click', carregar);
    document.getElementById('conta').addEventListener('click', abrirConta);
    carregar();
    clearInterval(estado.timer);
    estado.timer = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 60_000);
    setInterval(() => { const a = document.getElementById('atualizado'); if (a && estado.carregadoEm) a.textContent = `Atualizado ${haQuanto(new Date(estado.carregadoEm).toISOString())} · automático a cada 1 min`; }, 15_000);
  }

  window.addEventListener('hashchange', () => { if (estado.dados && document.getElementById('conteudo')) mostrarSecao(secaoAtual(), true); });

  async function carregar() {
    try {
      estado.dados = await api(`/metricas?dias=${estado.dias}`);
      estado.carregadoEm = Date.now();
      document.getElementById('atualizado').textContent = 'Atualizado agora · automático a cada 1 min';
      renderizar(estado.dados);
    } catch (e) {
      if (e.status === 401) { estado.admin = null; telaAcesso(true); return; }
      document.getElementById('conteudo').innerHTML = `<p class="erro">Não foi possível carregar: ${esc(e.message)}</p>`;
    }
  }

  const NOMES_EVENTO = {
    pdf_gerado: 'Relatório PDF gerado', pdf_compartilhado: 'Relatório PDF compartilhado', push_ativado: 'Notificações ativadas', push_desativado: 'Notificações desativadas',
    desfazer: 'Usou “Desfazer”', sync_offline: 'Sincronizou registros feitos offline', notif_clique: 'Abriu uma notificação', notif_acao: 'Usou botão da notificação',
    atalho_icone: 'Abriu por atalho/ação', app_instalado: 'Instalou o app', notif_enviada: 'Notificação enviada',
  };
  const NOMES_TIPO = { mamada: 'Amamentação', mamadeira: 'Mamadeira', sono: 'Sono', fralda: 'Fralda', remedio: 'Remédio', banho: 'Banho', alimentacao: 'Papinha', extracao: 'Extração', outro: 'Outro' };
  const NOMES_CONT = { cadastros: 'Cadastros', cadastros_exemplo: 'Contas de exemplo criadas', logins: 'Logins', logins_falhos: 'Logins com senha errada', contas_excluidas: 'Contas excluídas', bebes_criados: 'Bebês cadastrados', convites_aceitos: 'Convites aceitos' };
  let nomePais = (c) => c;
  try { const dn = new Intl.DisplayNames(['pt-BR'], { type: 'region' }); nomePais = (c) => { if (!c || c === '??') return 'Não identificado'; try { return dn.of(c) || c; } catch { return c; } }; } catch { /* sem Intl.DisplayNames */ }
  const comPais = (linhas) => linhas.map((l) => ({ ...l, pais: l.agrupado ? l.pais : nomePais(l.pais) }));

  /* CSV: cada tabela pode ser baixada (somente os números já agregados que estão na tela) */
  const csvs = {};
  let csvSeq = 0;
  function tabelaCsv(cab, linhas, nome) {
    const id = `t${++csvSeq}`;
    csvs[id] = { nome, cab, linhas };
    return id;
  }
  function baixarCsv(id) {
    const t = csvs[id]; if (!t) return;
    const limpa = (v) => `"${String(v ?? '').replace(/<[^>]+>/g, '').replace(/"/g, '""')}"`;
    const txt = [t.cab, ...t.linhas].map((l) => l.map(limpa).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${txt}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `painel-ninho-${t.nome}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest?.('[data-csv]'); if (b) baixarCsv(b.dataset.csv); });
  const tabela = (cab, linhas, nome, { aberta = false } = {}) => {
    const id = tabelaCsv(cab, linhas, nome);
    return `<details class="tabela" ${aberta ? 'open' : ''}><summary>Ver como tabela</summary><div class="tab"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="btn mini" type="button" data-csv="${id}">Baixar CSV</button></details>`;
  };
  const listaComCsv = (linhas, chave, total, nome, rotulo) => `${hlista(linhas, chave, total)}${linhas.length ? `<button class="btn mini alinhar" type="button" data-csv="${tabelaCsv([rotulo, 'Pessoas', '%'], linhas.map((l) => [l[chave], l.n, pctf(l.n, total, 1)]), nome)}">Baixar CSV</button>` : ''}`;
  const cartao = (titulo, sub, corpo, cls = '') => `<section class="cartao ${cls}"><header><h2>${titulo}</h2>${sub ? `<span class="faint">${sub}</span>` : ''}</header>${corpo}</section>`;
  const kpi = (rot, val, sub, cls = '') => `<div class="kpi"><span class="rot">${rot}</span><span class="val ${cls}">${val}</span><span class="sub">${sub}</span></div>`;

  /** Desenho dos gráficos de cada seção (feito só quando a seção aparece, para medir a largura certa). */
  let desenhos = {};
  function mostrarSecao(id, rolar) {
    gravarPref('secao', id);
    document.querySelectorAll('.lateral a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.sec === id));
    document.querySelectorAll('[data-secao]').forEach((s) => { s.hidden = s.dataset.secao !== id; });
    const ativo = document.querySelector(`.lateral a[data-sec="${id}"]`);
    ativo?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    (desenhos[id] || (() => {}))();
    if (rolar) window.scrollTo({ top: 0 });
  }

  function renderizar(d) {
    const k = d.kpis;
    const c = document.getElementById('conteudo');
    const taxaErro = k.req24 ? k.erros5xx24 / k.req24 : 0;
    const stick = k.mau ? k.dau_ontem / k.mau : 0;
    const total = d.serie.reduce((s, x) => s + x.registros, 0);
    const mediaAtivos = d.serie.length ? d.serie.reduce((s, x) => s + x.ativos, 0) / d.serie.length : 0;
    const usoMap = Object.fromEntries(d.uso.map((u) => [u.evento, u]));
    const enviadas = usoMap.notif_enviada?.vezes ?? 0; const abertas = (usoMap.notif_clique?.vezes ?? 0) + (usoMap.notif_acao?.vezes ?? 0);
    const totPlat = d.plataformas.reduce((s, x) => s + x.n, 0);
    const totReg = d.regioes.reduce((s, x) => s + x.n, 0);
    const totCid = d.cidades.reduce((s, x) => s + x.n, 0);
    const totTipo = d.tipos_aparelho.reduce((s, x) => s + x.n, 0);
    const o = d.origem;
    const cron = d.sistema.cron_ultimo;
    const minCron = cron ? (Date.now() - Date.parse(cron.at)) / 60000 : null;
    const f = d.funil;
    const a = d.adocao;
    const sd = d.saude;
    const err24 = Object.values(d.erros.ultimas24).reduce((s, v) => s + v, 0);
    const nAlertas = d.alertas.filter((x) => x.nivel === 'critico' || x.nivel === 'atencao').length;
    const paisesAtivos = comPais(d.paises);
    const cidadesIdent = d.cidades.filter((x) => !x.agrupado && !/não identificada/.test(x.cidade)).length;
    for (const kk of Object.keys(csvs)) delete csvs[kk];
    desenhos = {};

    const nota = `<div class="privacidade"><span aria-hidden="true">🔒</span><span>Apenas <b>números agregados</b>: nenhum nome, e-mail, foto, recado ou dado de bebê. Grupos com menos de 3 pessoas aparecem como “Outros”. Contas de exemplo ficam de fora. Atividade medida desde ${d.desde_atividade ? diaCurto(d.desde_atividade) : 'a próxima visita ao app'}.</span></div>`;
    const cab = (id) => { const s = SECOES.find((x) => x.id === id); return `<div class="sec-cab"><h2 class="sec-titulo">${s.nome}</h2><p class="muted">${s.pergunta}</p></div>`; };
    const alertasHtml = d.alertas.length ? `<div class="alertas">${d.alertas.map((al) => `
        <div class="alerta ${al.nivel}"><span class="ic" aria-hidden="true">${al.nivel === 'positivo' ? '↑' : al.nivel === 'info' ? 'i' : '!'}</span>
          <span class="tag">${{ critico: 'Crítico', atencao: 'Atenção', positivo: 'Positivo', info: 'Informação' }[al.nivel]}</span>
          <b>${esc(al.titulo)}</b><span class="muted" style="font-size:13px">${esc(al.detalhe)}</span>
          ${al.acao ? `<span></span><span class="acao">${esc(al.acao)}</span>` : ''}
        </div>`).join('')}</div>` : '<div class="tudo-ok"><span class="status st-ok">Tudo estável</span><span class="muted">Sem erros relevantes, lentidão ou quedas de uso.</span></div>';

    /* ---------- Funil ---------- */
    const etapas = [
      ['Criaram conta', f.cadastros, 'contas reais criadas no período'],
      ['Vincularam um bebê', f.vinculados, 'cadastraram o bebê ou entraram por convite'],
      ['Fizeram o 1º registro', f.primeiro_registro, 'mamada, sono, fralda…'],
      ['Registraram em 3+ dias', f.habito, 'sinal de hábito criado'],
    ];
    const funilHtml = f.cadastros ? `<div class="funil">${etapas.map(([nome, v, dica], i) => `
      <div class="etapa"><div class="etapa-txt"><b>${nome}</b><span class="faint">${dica}</span></div>
        <div class="etapa-barra"><span style="width:${Math.max(2, (v / f.cadastros) * 100)}%"></span></div>
        <div class="etapa-v"><b>${fmt(v)}</b><span class="faint">${pctf(v, f.cadastros)}${i ? ` · ${pctf(v, etapas[i - 1][1])} da etapa anterior` : ''}</span></div></div>`).join('')}</div>
      <p class="leitura">Compartilham o bebê com outro cuidador: <b>${fmt(f.familia_2)}</b> (${pctf(f.familia_2, f.cadastros)} das contas novas) — famílias com 2+ cuidadores tendem a registrar mais e abandonar menos.</p>
      <p class="leitura">${f.horas_ate_1o != null ? `Tempo médio entre criar a conta e o 1º registro: <b>${f.horas_ate_1o < 1 ? `${fmt(f.horas_ate_1o * 60)} min` : f.horas_ate_1o < 48 ? `${fmt(f.horas_ate_1o, 1)} h` : `${fmt(f.horas_ate_1o / 24, 1)} dias`}</b>. ` : ''}${(() => {
        const perdas = etapas.slice(1).map(([nome, v], i) => ({ nome, perda: etapas[i][1] ? 1 - v / etapas[i][1] : 0 }));
        const pior = perdas.sort((x, y) => y.perda - x.perda)[0];
        return pior && pior.perda > 0 ? `Maior perda: antes de <b>“${pior.nome}”</b> (${fmt(pior.perda * 100)}% não avançam). Priorize essa etapa.` : 'Sem perdas relevantes entre as etapas.';
      })()}</p>` : '<p class="vazio">Nenhuma conta nova no período.</p>';

    /* ---------- Adoção de funcionalidades ---------- */
    const adoc = [
      ['Rotina (registros)', a.rotina], ['Família com 2+ cuidadores', a.convidou], ['Mural (estoque/compras)', a.mural], ['Recados', a.recados],
      ['Crescimento (2+ medidas)', a.crescimento], ['Consultas agendadas', a.consultas], ['Vacinas marcadas', a.vacinas], ['Foto do bebê', a.foto],
      ['Relatório PDF', a.pdf], ['Notificações ativas', a.notificacoes],
    ].map(([recurso, n]) => ({ recurso, n: n ?? 0 })).sort((x, y) => y.n - x.n);
    const menosUsado = adoc.filter((x) => x.recurso !== 'Rotina (registros)').slice(-1)[0];

    /* ---------- Mapa de calor ---------- */
    const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const mc = {}; let mcMax = 0; let pico = null;
    for (const x of d.calor) { mc[`${x.dow}-${x.h}`] = x.n; if (x.n > mcMax) { mcMax = x.n; pico = x; } }
    const porHora = Array.from({ length: 24 }, (_, h) => d.calor.filter((x) => x.h === h).reduce((s, x) => s + x.n, 0));
    const madrugada = porHora.slice(0, 6).reduce((s, v) => s + v, 0);
    const calorHtml = d.calor.length ? `<div class="calor" role="table" aria-label="Registros por dia da semana e hora">
        <div class="calor-l"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="calor-h">${h % 3 === 0 ? `${h}h` : ''}</span>`).join('')}</div>
        ${[1, 2, 3, 4, 5, 6, 0].map((dw) => `<div class="calor-l"><span class="calor-d">${DIAS[dw]}</span>${Array.from({ length: 24 }, (_, h) => { const v = mc[`${dw}-${h}`] ?? 0; const nv = v ? Math.min(6, Math.max(1, Math.ceil((v / mcMax) * 6))) : 0; return `<span class="cel" style="${nv ? `background:var(--seq-${nv})` : ''}" data-dica="${DIAS[dw]} ${h}h–${h + 1}h: <b>${fmt(v)}</b> registros"></span>`; }).join('')}</div>`).join('')}
      </div><p class="leitura">Pico: <b>${pico ? `${DIAS[pico.dow]} às ${pico.h}h` : '–'}</b>. ${total ? `<b>${pctf(madrugada, total)}</b> dos registros acontecem de madrugada (0h–6h) — telas e botões precisam funcionar bem no escuro e com uma mão.` : ''}</p>` : '<p class="vazio">Sem registros no período.</p>';

    /* ---------- Saúde das famílias ---------- */
    const saudeLinhas = [
      ['Uso intenso (7+ registros/dia)', sd.intensa, 'st-ok'], ['Uso regular (2–6/dia)', sd.regular, 'st-ok'], ['Uso leve (menos de 2/dia)', sd.leve, 'st-aviso'],
      ['Esfriando (parou nos últimos 7 dias)', sd.esfriando, 'st-erro'], ['Paradas há mais de 28 dias', sd.paradas, 'st-erro'], ['Nunca registraram', sd.sem_registro, 'st-aviso'],
    ];

    c.innerHTML = `
      <div data-secao="geral" hidden>${cab('geral')}${nota}
        <section aria-label="Alertas">${alertasHtml}</section>
        <section class="kpis" aria-label="Indicadores principais">
          ${kpi('Usuários (contas reais)', fmt(k.usuarios), `+${fmt(k.novos)} no período ${delta(k.novos, k.novos_ant)}`)}
          ${kpi('Ativos hoje', fmt(k.dau), `ontem: ${fmt(k.dau_ontem)} · dia em andamento`)}
          ${kpi('Ativos em 7 dias', fmt(k.wau), `${delta(k.wau, k.wau_ant)} vs. 7 dias anteriores`)}
          ${kpi('Ativos em 30 dias', fmt(k.mau), `${pctf(k.mau, k.usuarios)} das contas · fidelidade ${pctf(k.dau_ontem, k.mau)}`)}
          ${kpi('Famílias ativas no período', fmt(k.familias_ativas), `de ${fmt(k.familias)} · ${delta(k.familias_ativas, k.familias_ativas_ant)}`)}
          ${kpi('Ativação (1º registro)', pctf(f.primeiro_registro, f.cadastros), `${fmt(f.primeiro_registro)} de ${fmt(f.cadastros)} contas novas`)}
          ${kpi('Famílias esfriando', fmt(sd.esfriando), `de ${fmt(sd.total)} · pararam nos últimos 7 dias`, sd.esfriando ? 'st-aviso' : '')}
          ${kpi('Saúde do servidor (24 h)', k.req24 ? pctf(k.erros5xx24, k.req24, 1) : '–', `erros 5xx · ${fmt(k.req24)} req. · ${k.latencia24 ? `${fmt(k.latencia24)} ms` : '–'}`, taxaErro >= 0.02 ? 'st-erro' : '')}
        </section>
        <div class="grade">
          ${cartao('Pessoas ativas por dia', 'usuários distintos que abriram o app', `<p class="leitura">Média de <b>${fmt(mediaAtivos, 1)}</b> por dia; pico de <b>${fmt(Math.max(0, ...d.serie.map((x) => x.ativos)))}</b>. Fidelidade (ativos ontem ÷ ativos em 30 dias): <b>${pctf(k.dau_ontem, k.mau)}</b>${stick >= 0.4 ? ' — uso diário forte' : stick >= 0.2 ? ' — uso frequente' : k.mau ? ' — uso ocasional' : ''}.</p><div class="graf" id="g-ativos"></div>${tabela(['Dia', 'Ativos', 'Cadastros', 'Registros'], d.serie.map((x) => [diaCurto(x.dia), fmt(x.ativos), fmt(x.cadastros), fmt(x.registros)]), 'serie-diaria')}`)}
          ${cartao('Resumo rápido', 'para onde olhar', `<ul class="resumo">
            <li><b>${fmt(paisesAtivos.filter((p) => !p.agrupado).length)}</b> país(es) · <b>${fmt(cidadesIdent)}</b> cidade(s) com usuários ativos <a href="#local">ver localização</a></li>
            <li>Aparelho mais usado: <b>${esc(d.plataformas[0]?.plataforma || '–')}</b> (${pctf(d.plataformas[0]?.n || 0, totPlat)}) · app instalado por <b>${pctf(d.instalacao.app, d.instalacao.app + d.instalacao.navegador)}</b> <a href="#aparelhos">ver aparelhos</a></li>
            <li>Funcionalidade menos adotada: <b>${esc(menosUsado?.recurso || '–')}</b> (${pctf(menosUsado?.n || 0, a.familias)} das famílias) <a href="#engajamento">ver engajamento</a></li>
            <li>Notificações: <b>${pctf(k.com_push, k.usuarios)}</b> ativaram · abertura de <b>${pctf(abertas, enviadas)}</b> <a href="#notificacoes">ver notificações</a></li>
            <li>Erros nas últimas 24 h: <b>${fmt(err24)}</b> <a href="#erros">ver erros</a></li></ul>`)}
        </div>
      </div>

      <div data-secao="crescimento" hidden>${cab('crescimento')}
        <section class="kpis">
          ${kpi('Contas novas no período', fmt(k.novos), `${delta(k.novos, k.novos_ant)} vs. período anterior`)}
          ${kpi('Convites aceitos', fmt(d.contadores.convites_aceitos ?? 0), 'pessoas que entraram em uma família')}
          ${kpi('Bebês cadastrados', fmt(d.contadores.bebes_criados ?? 0), 'novas famílias no período')}
          ${kpi('Contas excluídas', fmt(d.contadores.contas_excluidas ?? 0), `${pctf(d.contadores.contas_excluidas ?? 0, k.novos)} das novas`, (d.contadores.contas_excluidas ?? 0) > 0 ? 'st-aviso' : '')}
        </section>
        ${cartao('Funil de ativação', 'contas criadas no período', funilHtml)}
        <div class="grade">
          ${cartao('Novos cadastros por dia', 'contas reais', '<div class="graf" id="g-cadastros"></div>')}
          ${cartao('Eventos de conta no período', '', Object.keys(d.contadores).length ? `<div class="tab"><table><tbody>${Object.entries(d.contadores).sort((x, y) => y[1] - x[1]).map(([kk, v]) => `<tr><td>${esc(NOMES_CONT[kk] || kk)}</td><td class="n">${fmt(v)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Sem eventos de conta no período.</p>')}
        </div>
      </div>

      <div data-secao="engajamento" hidden>${cab('engajamento')}
        <section class="kpis">
          ${kpi('Registros no período', fmt(k.registros), `${delta(k.registros, k.registros_ant)} vs. período anterior`)}
          ${kpi('Registros por família/dia', fmt(k.familias_ativas ? k.registros / k.familias_ativas / d.dias : 0, 1), 'entre famílias ativas')}
          ${kpi('Cuidadores por família', fmt(k.cuidadores_por_familia, 1), `${pctf(a.convidou, a.familias)} das famílias têm 2+`)}
          ${kpi('Fidelidade', pctf(k.dau_ontem, k.mau), 'ativos ontem ÷ ativos em 30 dias')}
        </section>
        <div class="grade">
          ${cartao('Saúde das famílias', 'uso nos últimos 7 dias', `<div class="tab"><table><tbody>${saudeLinhas.map(([nome, v, cls]) => `<tr><td><span class="status ${cls}">${nome}</span></td><td class="n">${fmt(v)}</td><td class="n">${pctf(v, sd.total)}</td></tr>`).join('')}</tbody></table></div><p class="leitura">${sd.esfriando ? `<b>${fmt(sd.esfriando)}</b> família(s) esfriando: é o grupo com maior chance de abandono e o mais barato de recuperar (lembrete, mensagem, ajuda no uso).` : 'Nenhuma família esfriando na última semana.'}</p>`)}
          ${cartao('Adoção das funcionalidades', `% das ${fmt(a.familias)} famílias que já usaram`, `${hlista(adoc, 'recurso', a.familias)}<p class="leitura">Recursos com baixa adoção pedem divulgação dentro do app (dica no momento certo) ou revisão de usabilidade.</p>`)}
        </div>
        ${cartao('Quando as famílias usam o app', 'registros por dia da semana e hora (Brasília)', calorHtml)}
        <div class="grade">
          ${cartao('Registros de rotina por dia', 'contagem, sem conteúdo', '<div class="graf" id="g-registros"></div>')}
          ${cartao('O que mais registram', 'tipos de registro no período', hlista(d.tipos.map((t) => ({ tipo: NOMES_TIPO[t.tipo] || t.tipo, n: t.n })), 'tipo', total))}
        </div>
        ${cartao('Retenção por semana de cadastro', '% da turma ativa em cada semana seguinte', d.coortes.length ? `<div class="tab"><table class="coorte"><thead><tr><th>Turma (semana)</th><th>Contas</th>${[0, 1, 2, 3, 4].map((s) => `<th>${s === 0 ? 'Semana do cadastro' : `+${s} sem.`}</th>`).join('')}</tr></thead><tbody>${d.coortes.map((co) => `<tr><td>${diaCurto(co.coorte)}</td><td class="n">${fmt(co.n)}</td>${co.semanas.map((v) => {
            if (v == null) return '<td class="c faint">·</td>';
            const p = co.n ? v / co.n : 0; const nivel = Math.min(6, Math.max(1, Math.ceil(p * 6)));
            return `<td class="c" style="background:var(--seq-${nivel});color:${nivel >= 4 ? '#fff' : 'var(--ink)'}" title="${fmt(v)} de ${fmt(co.n)}">${fmt(p * 100)}%</td>`;
          }).join('')}</tr>`).join('')}</tbody></table></div><p class="faint">Leia por linha: de quem se cadastrou naquela semana, quantos % voltaram nas semanas seguintes.</p>` : '<p class="vazio">Ainda não há turmas de cadastro suficientes.</p>')}
        ${cartao('Uso das funcionalidades', 'vezes · pessoas distintas', d.uso.length ? `<div class="tab"><table><thead><tr><th>Ação</th><th>Vezes</th><th>Pessoas</th></tr></thead><tbody>${d.uso.slice().sort((x, y) => y.vezes - x.vezes).map((u) => `<tr><td>${esc(NOMES_EVENTO[u.evento] || u.evento)}</td><td class="n">${fmt(u.vezes)}</td><td class="n">${fmt(u.pessoas)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Sem uso registrado no período.</p>')}
      </div>

      <div data-secao="local" hidden>${cab('local')}
        <section class="kpis">
          ${kpi('Países', fmt(paisesAtivos.filter((p) => !p.agrupado).length), 'com usuários ativos no período')}
          ${kpi('Estados / regiões', fmt(d.regioes.filter((r) => !r.agrupado).length), 'com 3+ pessoas ativas')}
          ${kpi('Cidades', fmt(cidadesIdent), 'com 3+ pessoas ativas')}
          ${kpi('Cadastros com origem', fmt(o.total), `no período · ${fmt(o.medidos_total)} desde o início da medição`)}
        </section>
        <p class="nota-dado">Local <b>aproximado pela rede de internet</b> (Cloudflare), sem GPS: a cidade pode aparecer como a do provedor (ex.: capital próxima). Grupos com menos de 3 pessoas viram “Outros”.</p>
        <div class="grade">
          ${cartao('Usuários ativos por país', 'ativos no período', listaComCsv(paisesAtivos, 'pais', totReg, 'ativos-pais', 'País'))}
          ${cartao('Usuários ativos por estado', 'ativos no período', listaComCsv(d.regioes, 'regiao', totReg, 'ativos-estado', 'Estado'))}
          ${cartao('Usuários ativos por cidade', 'ativos no período', listaComCsv(d.cidades.slice(0, 20), 'cidade', totCid, 'ativos-cidade', 'Cidade'), 'largo')}
        </div>
        <h3 class="sub-sec">Onde as contas foram criadas <span class="faint">(cadastros no período)</span></h3>
        ${o.total ? `<div class="grade tres">
          ${cartao('País de cadastro', '', listaComCsv(comPais(o.paises), 'pais', o.total, 'cadastro-pais', 'País'))}
          ${cartao('Estado de cadastro', '', listaComCsv(o.estados, 'regiao', o.total, 'cadastro-estado', 'Estado'))}
          ${cartao('Cidade de cadastro', '', listaComCsv(o.cidades.slice(0, 15), 'cidade', o.total, 'cadastro-cidade', 'Cidade'))}
        </div>` : '<p class="vazio">Nenhum cadastro com origem registrada no período. A origem passou a ser medida nesta versão; contas antigas não têm esse dado.</p>'}
      </div>

      <div data-secao="aparelhos" hidden>${cab('aparelhos')}
        <section class="kpis">
          ${kpi('Sistema mais usado', esc(d.plataformas[0]?.plataforma || '–'), `${pctf(d.plataformas[0]?.n || 0, totPlat)} dos ativos`)}
          ${kpi('Celular', pctf(d.tipos_aparelho.find((t) => t.tipo === 'Celular')?.n || 0, totTipo), 'dos ativos usam pelo celular')}
          ${kpi('App instalado', pctf(d.instalacao.app, d.instalacao.app + d.instalacao.navegador), `${fmt(d.instalacao.app)} instalado · ${fmt(d.instalacao.navegador)} navegador`)}
          ${kpi('Navegador mais usado no cadastro', esc(o.navegadores[0]?.navegador || '–'), o.total ? `${pctf(o.navegadores[0]?.n || 0, o.total)} dos cadastros` : 'sem cadastros no período')}
        </section>
        <h3 class="sub-sec">Aparelho de cadastro <span class="faint">(contas criadas no período)</span></h3>
        ${o.total ? `<div class="grade">
          ${cartao('Modelo do aparelho', 'quando o navegador informa', `${listaComCsv(o.modelos.slice(0, 15), 'modelo', o.total, 'cadastro-modelo', 'Modelo')}<p class="faint">O iPhone não informa o modelo exato (aparece só “iPhone”). No Android, o modelo vem quando o Chrome permite.</p>`)}
          ${cartao('Sistema no cadastro', '', listaComCsv(o.sistemas, 'plataforma', o.total, 'cadastro-sistema', 'Sistema'))}
          ${cartao('Tipo de aparelho no cadastro', '', listaComCsv(o.tipos, 'tipo', o.total, 'cadastro-tipo', 'Tipo'))}
          ${cartao('Navegador no cadastro', '', listaComCsv(o.navegadores, 'navegador', o.total, 'cadastro-navegador', 'Navegador'))}
        </div>` : '<p class="vazio">Nenhum cadastro com aparelho registrado no período. O aparelho de cadastro passou a ser medido nesta versão.</p>'}
        <h3 class="sub-sec">Aparelhos em uso <span class="faint">(ativos no período)</span></h3>
        <div class="grade">
          ${cartao('Sistema', '', listaComCsv(d.plataformas, 'plataforma', totPlat, 'ativos-sistema', 'Sistema'))}
          ${cartao('Tipo de aparelho', '', `${listaComCsv(d.tipos_aparelho, 'tipo', totTipo, 'ativos-tipo', 'Tipo')}<p class="leitura">No iPhone, as notificações só funcionam com o app <b>instalado na tela inicial</b>: incentive a instalação para quem usa iOS.</p>`)}
        </div>
      </div>

      <div data-secao="notificacoes" hidden>${cab('notificacoes')}
        <section class="kpis">
          ${kpi('Pessoas com notificação', pctf(k.com_push, k.usuarios), `${fmt(k.com_push)} de ${fmt(k.usuarios)} contas`)}
          ${kpi('Enviadas no período', fmt(enviadas), 'lembretes, recados, estoque…')}
          ${kpi('Taxa de abertura', pctf(abertas, enviadas), `${fmt(abertas)} aberturas ou ações`)}
          ${kpi('Falhas de envio (24 h)', fmt(d.erros.ultimas24.push ?? 0), 'recusas do serviço de push', (d.erros.ultimas24.push ?? 0) >= 5 ? 'st-aviso' : '')}
        </section>
        <div class="grade">
          ${cartao('Enviadas × abertas por dia', '', '<div class="legenda"><span><i style="background:var(--s1)"></i>Enviadas</span><span><i style="background:var(--s2)"></i>Abertas</span></div><div class="graf" id="g-notif"></div>')}
          ${cartao('Aparelhos inscritos por serviço', 'quem entrega o aviso', `${listaComCsv(d.servicos_push, 'servico', d.servicos_push.reduce((s, x) => s + x.n, 0), 'push-servico', 'Serviço')}<p class="leitura">Se as falhas se concentram em um serviço (ex.: Apple), o problema costuma ser dele ou das chaves VAPID, não do app.</p>`)}
        </div>
      </div>

      <div data-secao="estabilidade" hidden>${cab('estabilidade')}
        <div class="grade">
          ${cartao('Requisições por hora', 'últimas 48 h (Brasília)', '<p class="leitura">Mostra a <b>oscilação de uso</b>. Quedas bruscas em horário de pico, junto com erros, indicam problema.</p><div class="graf" id="g-req"></div>')}
          ${cartao('Taxa de erro do servidor por hora', '% de respostas 5xx · meta abaixo de 1%', `<p class="leitura">${k.req24 ? `Últimas 24 h: <b>${pctf(k.erros5xx24, k.req24, 2)}</b> de erro e tempo médio de <b>${fmt(k.latencia24)} ms</b>.` : 'Sem requisições nas últimas 24 h.'}</p><div class="graf" id="g-erro"></div>`)}
        </div>
        ${cartao('Rotas mais usadas', 'identificadores removidos · período selecionado', d.estabilidade.rotas.length ? `<div class="tab"><table><thead><tr><th>Rota</th><th>Requisições</th><th>Erros 5xx</th><th>Erros 4xx</th><th>Tempo médio</th></tr></thead><tbody>${d.estabilidade.rotas.map((r) => `<tr><td><code>${esc(r.rota)}</code></td><td class="n">${fmt(r.n)}</td><td class="n ${r.e5 ? 'st-erro' : ''}">${fmt(r.e5)}</td><td class="n">${fmt(r.e4)}</td><td class="n ${r.ms > 800 ? 'st-aviso' : ''}">${fmt(r.ms)} ms</td></tr>`).join('')}</tbody></table></div><p class="faint">4xx são respostas esperadas (senha errada, sessão expirada); acompanhe se crescerem muito.</p>` : '<p class="vazio">Sem requisições registradas no período.</p>')}
      </div>

      <div data-secao="erros" hidden>${cab('erros')}
        <section class="kpis">
          ${kpi('Servidor (24 h)', fmt(d.erros.ultimas24.servidor ?? 0), 'falhas 5xx', (d.erros.ultimas24.servidor ?? 0) ? 'st-erro' : '')}
          ${kpi('Tela do app (24 h)', fmt(d.erros.ultimas24.app ?? 0), 'erros de JavaScript nos aparelhos')}
          ${kpi('Notificações (24 h)', fmt(d.erros.ultimas24.push ?? 0), 'envios recusados')}
          ${kpi('Lembretes automáticos (24 h)', fmt(d.erros.ultimas24.cron ?? 0), 'rotina a cada 15 min', (d.erros.ultimas24.cron ?? 0) ? 'st-erro' : '')}
        </section>
        ${cartao('Erros por dia', 'todas as origens', '<div class="graf" id="g-erros-dia"></div>')}
        ${cartao('Lista de erros', 'agrupados por mensagem · textos sem dados pessoais', d.erros.lista.length ? `<div class="tab"><table><thead><tr><th>Origem</th><th>Onde</th><th>Mensagem</th><th>Vezes</th><th>Última</th><th>Versão</th></tr></thead><tbody>${d.erros.lista.map((e) => `<tr><td><span class="pill p-${esc(e.origem)}">${esc({ servidor: 'Servidor', app: 'Tela do app', push: 'Notificação', cron: 'Lembretes' }[e.origem] || e.origem)}</span></td><td><code>${esc(e.rota || '–')}</code>${e.status ? ` <span class="faint">${esc(e.status)}</span>` : ''}${e.plataformas ? `<br><span class="faint">${esc(e.plataformas)}</span>` : ''}</td><td class="msg">${esc(e.mensagem)}</td><td class="n">${fmt(e.n)}</td><td class="n">${quando(e.ultimo)}</td><td>${esc(e.versao || '–')}</td></tr>`).join('')}</tbody></table></div><button class="btn mini alinhar" type="button" data-csv="${tabelaCsv(['Origem', 'Onde', 'Status', 'Mensagem', 'Vezes', 'Última', 'Versão'], d.erros.lista.map((e) => [e.origem, e.rota, e.status, e.mensagem, e.n, quando(e.ultimo), e.versao]), 'erros')}">Baixar CSV</button>` : '<p class="vazio">Nenhum erro registrado no período. 🎉</p>')}
      </div>

      <div data-secao="sistema" hidden>${cab('sistema')}
        ${cartao('Situação', '', `<div class="fatos">
            <div class="fato"><div class="rot">Lembretes automáticos</div><div class="val">${!cron ? '<span class="status st-aviso">Sem registro</span>' : cron.valor === 'erro' ? '<span class="status st-erro">Falhou</span>' : minCron > 40 ? '<span class="status st-erro">Parado</span>' : '<span class="status st-ok">Rodando</span>'}</div><div class="faint">${cron ? `última rodada ${haQuanto(cron.at)}` : 'roda a cada 15 min'}</div></div>
            <div class="fato"><div class="rot">Versão do app em uso</div><div class="val">${esc(d.sistema.versao_app?.valor || '–')}</div><div class="faint">${d.sistema.versao_app ? `vista ${haQuanto(d.sistema.versao_app.at)}` : ''}</div></div>
            <div class="fato"><div class="rot">Aparelhos com notificação</div><div class="val">${fmt(d.banco.aparelhos_push)}</div></div>
            <div class="fato"><div class="rot">Contas de exemplo ativas</div><div class="val">${fmt(k.contas_exemplo)}</div><div class="faint">apagadas em 24 h</div></div>
          </div>`)}
        ${cartao('Volume no banco', 'totais, incluindo contas de exemplo', `<div class="fatos">${[['Contas', d.banco.contas], ['Bebês', d.banco.bebes], ['Registros', d.banco.registros], ['Fotos', d.banco.fotos], ['Erros guardados', d.banco.erros]].map(([r, v]) => `<div class="fato"><div class="rot">${r}</div><div class="val">${fmt(v)}</div></div>`).join('')}</div><p class="faint">Retenção automática: requisições por hora 120 dias · erros 90 dias · atividade diária 400 dias.</p>`)}
      </div>
      <p class="faint rodape">Gerado em ${quando(d.gerado_em)} · período ${diaCurto(d.periodo.ini)} a ${diaCurto(d.periodo.fim)}.</p>`;

    // Contadores na navegação lateral
    const marca = (id, v, cls) => { const el = document.querySelector(`[data-cont="${id}"]`); if (!el) return; el.hidden = !v; el.textContent = v > 99 ? '99+' : v; el.className = `contador ${cls}`; };
    marca('geral', nAlertas, d.alertas.some((x) => x.nivel === 'critico') ? 'c-crit' : 'c-aviso');
    marca('erros', err24, 'c-crit');
    marca('engajamento', sd.esfriando, 'c-aviso');

    // Gráficos por seção
    const rot = (dia) => diaCurto(dia);
    desenhos.geral = () => linha(document.getElementById('g-ativos'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: x.ativos, dica: `${diaCurto(x.dia)}: <b>${fmt(x.ativos)}</b> ativos` })));
    desenhos.crescimento = () => barras(document.getElementById('g-cadastros'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: x.cadastros, dica: `${diaCurto(x.dia)}: <b>${fmt(x.cadastros)}</b> cadastros` })), { cor: 'var(--s2)' });
    desenhos.engajamento = () => {
      barras(document.getElementById('g-registros'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: x.registros, dica: `${diaCurto(x.dia)}: <b>${fmt(x.registros)}</b> registros` })), { altura: 170 });
      document.querySelectorAll('.cel').forEach((cel) => { cel.addEventListener('mousemove', (ev) => mostrarTip(cel.dataset.dica, ev)); cel.addEventListener('mouseleave', esconderTip); });
    };
    desenhos.notificacoes = () => barrasDuplas(document.getElementById('g-notif'), d.notificacoes.map((x) => ({ rotulo: rot(x.dia), a: x.enviadas, b: x.abertas, dica: `${diaCurto(x.dia)}: <b>${fmt(x.enviadas)}</b> enviadas · <b>${fmt(x.abertas)}</b> abertas` })));
    const horas = preencherHoras(d.estabilidade.horas);
    desenhos.estabilidade = () => {
      barras(document.getElementById('g-req'), horas.map((h) => ({ rotulo: h.rotulo, v: h.n, dica: `${h.titulo}: <b>${fmt(h.n)}</b> requisições${h.e5 ? ` · ${fmt(h.e5)} erros` : ''}` })));
      linha(document.getElementById('g-erro'), horas.map((h) => ({ rotulo: h.rotulo, v: h.n ? (h.e5 / h.n) * 100 : 0, dica: `${h.titulo}: <b>${h.n ? fmt((h.e5 / h.n) * 100, 1) : 0}%</b> de erro (${fmt(h.e5)} de ${fmt(h.n)}) · ${h.n ? fmt(h.ms / h.n) : 0} ms` })), { cor: 'var(--critical)', formato: (v) => `${fmt(v, v < 10 && v % 1 ? 1 : 0)}%`, maxFixo: Math.max(4, ...horas.map((h) => (h.n ? (h.e5 / h.n) * 100 : 0))) });
    };
    desenhos.erros = () => {
      const porDia = {}; for (const x of d.erros.por_dia) porDia[x.dia] = (porDia[x.dia] ?? 0) + x.n;
      barras(document.getElementById('g-erros-dia'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: porDia[x.dia] ?? 0, dica: `${diaCurto(x.dia)}: <b>${fmt(porDia[x.dia] ?? 0)}</b> erros${d.erros.por_dia.filter((e) => e.dia === x.dia).map((e) => ` · ${esc(e.origem)} ${fmt(e.n)}`).join('')}` })), { cor: 'var(--critical)', altura: 160 });
    };
    mostrarSecao(secaoAtual(), false);
  }

  /** Duas séries lado a lado por dia (mesma escala). */
  function barrasDuplas(el, dados, { altura = 180 } = {}) {
    const W = larguraDe(el); const rotuloA = rotulosPara(W); const H = altura; const m = { l: 36, r: 6, t: 8, b: 22 };
    const { passo, topo } = escalaY(Math.max(0, ...dados.map((d) => Math.max(d.a, d.b))));
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const slot = iw / Math.max(1, dados.length); const bw = Math.max(1.5, Math.min(12, (slot - 4) / 2));
    const y = (v) => m.t + ih - (v / topo) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Enviadas e abertas por dia">`;
    for (let v = 0; v <= topo + 1e-9; v += passo) s += `<line class="grade-l" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="rotulo" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    dados.forEach((d, i) => {
      const x0 = m.l + slot * i + (slot - (bw * 2 + 2)) / 2;
      [[d.a, 'var(--s1)', 0], [d.b, 'var(--s2)', bw + 2]].forEach(([v, cor, dx]) => { const h = Math.max(0, m.t + ih - y(v)); if (h > 0) s += `<rect x="${x0 + dx}" y="${y(v)}" width="${bw}" height="${h}" rx="${Math.min(2, bw / 2)}" style="fill:${cor}"/>`; });
      s += `<rect x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ih}" fill="transparent" data-i="${i}"/>`;
      if (dados.length <= rotuloA || i % Math.ceil(dados.length / rotuloA) === 0) s += `<text class="rotulo" x="${m.l + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
    });
    s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
    el.innerHTML = s;
    el.querySelectorAll('rect[data-i]').forEach((r) => { r.addEventListener('mousemove', (ev) => mostrarTip(dados[r.dataset.i].dica, ev)); r.addEventListener('mouseleave', esconderTip); });
  }

  let redim;
  window.addEventListener('resize', () => { clearTimeout(redim); redim = setTimeout(() => { if (estado.dados && document.getElementById('conteudo')) (desenhos[secaoAtual()] || (() => {}))(); }, 200); });

  /** Completa as 48 horas (horas sem tráfego = 0). */
  function preencherHoras(linhas) {
    const mapa = Object.fromEntries(linhas.map((l) => [l.hora, l]));
    const out = [];
    for (let i = 47; i >= 0; i--) {
      const iso = new Date(Date.now() - 3 * 3600_000 - i * 3600_000).toISOString().slice(0, 13);
      const l = mapa[iso] || { n: 0, e5: 0, ms: 0 };
      out.push({ rotulo: `${iso.slice(11, 13)}h`, titulo: `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 13)}h`, n: l.n, e5: l.e5, ms: l.ms });
    }
    return out;
  }

  /* ---------------- conta e administradores ---------------- */
  async function abrirConta() {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Conta">
      <div style="display:flex;justify-content:space-between;align-items:center"><h2>${esc(estado.admin.nome)}</h2><button class="btn" data-fechar type="button">Fechar</button></div>
      <p class="faint">${esc(estado.admin.email)}${estado.admin.dono ? ' · administrador principal' : ''}</p>
      <h2>Trocar senha</h2>
      <label>Senha atual<input type="password" id="s-atual" autocomplete="current-password"></label>
      <label>Nova senha (mín. 10)<input type="password" id="s-nova" autocomplete="new-password"></label>
      <button class="btn" id="s-salvar" type="button">Salvar nova senha</button><p id="s-msg"></p>
      <h2>Quem tem acesso ao painel</h2><div id="admins"><p class="faint">Carregando…</p></div>
      ${estado.admin.dono ? '<h2>Dar acesso a outra pessoa</h2><label>Nome<input id="a-nome"></label><label>E-mail<input id="a-email" type="email"></label><button class="btn" id="a-add" type="button">Criar acesso</button><p id="a-msg"></p>' : ''}
      <button class="btn" id="sair" type="button">Sair do painel</button>
    </div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.hasAttribute('data-fechar')) fechar(); });
    document.addEventListener('keydown', function f(e) { if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', f); } });
    const lista = async () => {
      const r = await api('/admins');
      fundo.querySelector('#admins').innerHTML = r.admins.map((a) => `<div class="linha-adm"><span>${esc(a.nome)} <span class="faint">${esc(a.email)}${a.dono ? ' · principal' : ''} · último acesso ${a.ultimo_acesso ? haQuanto(a.ultimo_acesso) : 'nunca'}</span></span>${estado.admin.dono && !a.dono ? `<button class="btn" data-rem="${esc(a.id)}" type="button">Remover</button>` : ''}</div>`).join('');
      fundo.querySelectorAll('[data-rem]').forEach((b) => b.addEventListener('click', async () => {
        if (b.dataset.confirma !== '1') { b.dataset.confirma = '1'; b.textContent = 'Confirmar remoção'; return; }
        await api(`/admins/${b.dataset.rem}`, { method: 'DELETE' }); lista();
      }));
    };
    lista();
    fundo.querySelector('#s-salvar').addEventListener('click', async () => {
      const m = fundo.querySelector('#s-msg');
      try { await api('/senha', { method: 'POST', body: JSON.stringify({ atual: fundo.querySelector('#s-atual').value, nova: fundo.querySelector('#s-nova').value }) }); m.className = 'ok-msg'; m.textContent = 'Senha alterada.'; } catch (e) { m.className = 'erro'; m.textContent = e.message; }
    });
    fundo.querySelector('#a-add')?.addEventListener('click', async () => {
      const m = fundo.querySelector('#a-msg');
      try {
        const r = await api('/admins', { method: 'POST', body: JSON.stringify({ nome: fundo.querySelector('#a-nome').value, email: fundo.querySelector('#a-email').value }) });
        m.className = 'ok-msg'; m.innerHTML = `Acesso criado. Senha temporária: <code>${esc(r.senha_temporaria)}</code> — envie por um canal seguro e peça para trocar no primeiro acesso.`;
        lista();
      } catch (e) { m.className = 'erro'; m.textContent = e.message; }
    });
    fundo.querySelector('#sair').addEventListener('click', async () => { await api('/sair', { method: 'POST' }).catch(() => {}); fechar(); estado.admin = null; clearInterval(estado.timer); telaAcesso(true); });
  }

  /* ---------------- início ---------------- */
  (async () => {
    try {
      const e = await api('/estado');
      if (e.admin) { estado.admin = e.admin; montarPainel(); } else telaAcesso(e.configurado);
    } catch (e) { raiz.innerHTML = `<p class="carregando">Não foi possível conectar ao servidor: ${esc(e.message)}</p>`; }
  })();
})();
