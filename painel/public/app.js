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

  /* ---------------- painel ---------------- */
  function montarPainel() {
    raiz.innerHTML = `
      <header class="topo"><div class="in">
        <div class="marca"><span class="logo" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 14h3V8H2zM6.5 14h3V3h-3zM11 14h3V9.5h-3z" fill="#fff"/></svg></span><div><h1>Painel Ninho</h1><p class="faint" id="atualizado">–</p></div></div>
        <div class="seg" role="group" aria-label="Período">${[7, 30, 90].map((d) => `<button type="button" data-dias="${d}" aria-pressed="${estado.dias === d}">${d} dias</button>`).join('')}</div>
        <button class="btn" id="atualizar" type="button">Atualizar</button>
        <button class="btn" id="conta" type="button">${esc(estado.admin.nome.split(' ')[0])} ▾</button>
      </div></header>
      <main id="conteudo"><p class="carregando">Carregando números…</p></main>`;
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
    const cron = d.sistema.cron_ultimo;
    const minCron = cron ? (Date.now() - Date.parse(cron.at)) / 60000 : null;

    c.innerHTML = `
      <div class="privacidade"><span aria-hidden="true">🔒</span><span>Este painel mostra <b>apenas números agregados</b>: nenhum nome, e-mail, foto, recado ou dado de bebê. Regiões e aparelhos com menos de 3 pessoas aparecem como “Outros”. Contas de exemplo ficam de fora. Atividade medida desde ${d.desde_atividade ? diaCurto(d.desde_atividade) : 'a próxima visita ao app'}.</span></div>

      <section aria-label="Alertas">${d.alertas.length ? `<div class="alertas">${d.alertas.map((a) => `
        <div class="alerta ${a.nivel}"><span class="ic" aria-hidden="true">${a.nivel === 'critico' ? '!' : a.nivel === 'positivo' ? '↑' : a.nivel === 'atencao' ? '!' : 'i'}</span>
          <span class="tag">${{ critico: 'Crítico', atencao: 'Atenção', positivo: 'Positivo', info: 'Informação' }[a.nivel]}</span>
          <b>${esc(a.titulo)}</b><span class="muted" style="font-size:13px">${esc(a.detalhe)}</span>
          ${a.acao ? `<span></span><span class="acao">${esc(a.acao)}</span>` : ''}
        </div>`).join('')}</div>` : '<div class="tudo-ok"><span class="status st-ok">Tudo estável</span><span class="muted">Sem erros relevantes, lentidão ou quedas de uso.</span></div>'}</section>

      <section class="kpis" aria-label="Indicadores principais">
        <div class="kpi"><span class="rot">Usuários (contas reais)</span><span class="val">${fmt(k.usuarios)}</span><span class="sub">+${fmt(k.novos)} no período ${delta(k.novos, k.novos_ant)}</span></div>
        <div class="kpi"><span class="rot">Ativos hoje</span><span class="val">${fmt(k.dau)}</span><span class="sub">ontem: ${fmt(k.dau_ontem)} · dia em andamento</span></div>
        <div class="kpi"><span class="rot">Ativos em 7 dias</span><span class="val">${fmt(k.wau)}</span><span class="sub">${delta(k.wau, k.wau_ant)} vs. 7 dias anteriores</span></div>
        <div class="kpi"><span class="rot">Ativos em 30 dias</span><span class="val">${fmt(k.mau)}</span><span class="sub">${pctf(k.mau, k.usuarios)} das contas · fidelidade ${pctf(k.dau_ontem, k.mau)}</span></div>
        <div class="kpi"><span class="rot">Famílias ativas no período</span><span class="val">${fmt(k.familias_ativas)}</span><span class="sub">de ${fmt(k.familias)} · ${delta(k.familias_ativas, k.familias_ativas_ant)}</span></div>
        <div class="kpi"><span class="rot">Registros no período</span><span class="val">${fmt(k.registros)}</span><span class="sub">${delta(k.registros, k.registros_ant)} · ${fmt(k.familias_ativas ? k.registros / k.familias_ativas / d.dias : 0, 1)}/família/dia</span></div>
        <div class="kpi"><span class="rot">Notificações ativadas</span><span class="val">${pctf(k.com_push, k.usuarios)}</span><span class="sub">${fmt(k.com_push)} pessoas · abertura ${pctf(abertas, enviadas)}</span></div>
        <div class="kpi"><span class="rot">Saúde do servidor (24 h)</span><span class="val ${taxaErro >= 0.02 ? 'st-erro' : ''}">${k.req24 ? pctf(k.erros5xx24, k.req24, 1) : '–'}</span><span class="sub">erros 5xx · ${fmt(k.req24)} req. · ${k.latencia24 ? `${fmt(k.latencia24)} ms` : '–'}</span></div>
      </section>

      <div class="grade">
        <section class="cartao">
          <header><h2>Pessoas ativas por dia</h2><span class="faint">usuários distintos que abriram o app</span></header>
          <p class="leitura">Média de <b>${fmt(mediaAtivos, 1)}</b> por dia no período; pico de <b>${fmt(Math.max(0, ...d.serie.map((x) => x.ativos)))}</b>. Fidelidade (ativos ontem ÷ ativos em 30 dias): <b>${pctf(k.dau_ontem, k.mau)}</b>${stick >= 0.4 ? ' — uso diário forte' : stick >= 0.2 ? ' — uso frequente' : k.mau ? ' — uso ocasional' : ''}.</p>
          <div class="graf" id="g-ativos"></div>
          ${tabelaDe(['Dia', 'Ativos', 'Cadastros', 'Registros'], d.serie.map((x) => [diaCurto(x.dia), fmt(x.ativos), fmt(x.cadastros), fmt(x.registros)]))}
        </section>
        <section class="cartao">
          <header><h2>Novos cadastros por dia</h2><span class="faint">contas reais</span></header>
          <p class="leitura"><b>${fmt(k.novos)}</b> no período ${delta(k.novos, k.novos_ant)} vs. período anterior · ${fmt(d.contadores.convites_aceitos ?? 0)} convites aceitos · ${fmt(d.contadores.bebes_criados ?? 0)} bebês cadastrados.</p>
          <div class="graf" id="g-cadastros"></div>
        </section>
        <section class="cartao largo">
          <header><h2>Registros de rotina por dia</h2><span class="faint">mamadas, sonos, fraldas… (contagem, sem conteúdo)</span></header>
          <p class="leitura"><b>${fmt(total)}</b> registros no período ${delta(k.registros, k.registros_ant)}. Média de <b>${fmt(k.familias_ativas ? total / k.familias_ativas : 0, 1)}</b> por família ativa e <b>${fmt(k.cuidadores_por_familia, 1)}</b> cuidadores por família.</p>
          <div class="graf" id="g-registros"></div>
        </section>
      </div>

      <div class="grade">
        <section class="cartao">
          <header><h2>Estabilidade · requisições por hora</h2><span class="faint">últimas 48 h (Brasília)</span></header>
          <p class="leitura">Mostra a <b>oscilação de uso</b> ao longo do dia. Quedas bruscas em horário de pico, junto com erros, indicam problema no app.</p>
          <div class="graf" id="g-req"></div>
        </section>
        <section class="cartao">
          <header><h2>Taxa de erro do servidor por hora</h2><span class="faint">% de respostas 5xx · meta abaixo de 1%</span></header>
          <p class="leitura">${k.req24 ? `Nas últimas 24 h: <b>${pctf(k.erros5xx24, k.req24, 2)}</b> de erro e tempo médio de <b>${fmt(k.latencia24)} ms</b>.` : 'Sem requisições registradas nas últimas 24 h.'}</p>
          <div class="graf" id="g-erro"></div>
        </section>
        <section class="cartao largo">
          <header><h2>Rotas mais usadas</h2><span class="faint">identificadores removidos · período selecionado</span></header>
          ${d.estabilidade.rotas.length ? `<div class="tab"><table><thead><tr><th>Rota</th><th>Requisições</th><th>Erros 5xx</th><th>Erros 4xx</th><th>Tempo médio</th></tr></thead><tbody>${d.estabilidade.rotas.map((r) => `<tr><td><code>${esc(r.rota)}</code></td><td class="n">${fmt(r.n)}</td><td class="n ${r.e5 ? 'st-erro' : ''}">${fmt(r.e5)}</td><td class="n">${fmt(r.e4)}</td><td class="n ${r.ms > 800 ? 'st-aviso' : ''}">${fmt(r.ms)} ms</td></tr>`).join('')}</tbody></table></div><p class="faint">4xx são respostas esperadas (senha errada, sessão expirada, sem permissão); acompanhe se crescerem muito.</p>` : '<p class="vazio">Sem requisições registradas no período.</p>'}
        </section>
      </div>

      <div class="grade">
        <section class="cartao">
          <header><h2>Onde estão os usuários</h2><span class="faint">estado aproximado pela rede · ativos no período</span></header>
          ${hlista(d.regioes, 'regiao', totReg)}
          <p class="faint">Países: ${d.paises.length ? d.paises.map((p) => `${esc(p.pais)} ${fmt(p.n)}`).join(' · ') : '–'}. A localização vem da rede de internet (Cloudflare), sem GPS e sem cidade.</p>
        </section>
        <section class="cartao">
          <header><h2>Aparelhos</h2><span class="faint">ativos no período</span></header>
          ${hlista(d.plataformas, 'plataforma', totPlat)}
          <p class="leitura">App instalado na tela inicial: <b>${pctf(d.instalacao.app, d.instalacao.app + d.instalacao.navegador)}</b> (${fmt(d.instalacao.app)} instalado · ${fmt(d.instalacao.navegador)} pelo navegador). No iPhone, as notificações só funcionam com o app instalado.</p>
        </section>
      </div>

      <div class="grade">
        <section class="cartao">
          <header><h2>O que mais registram</h2><span class="faint">tipos de registro no período</span></header>
          ${hlista(d.tipos.map((t) => ({ tipo: NOMES_TIPO[t.tipo] || t.tipo, n: t.n })), 'tipo', total)}
        </section>
        <section class="cartao">
          <header><h2>Uso das funcionalidades</h2><span class="faint">vezes · pessoas distintas</span></header>
          ${d.uso.length ? `<div class="tab"><table><thead><tr><th>Ação</th><th>Vezes</th><th>Pessoas</th></tr></thead><tbody>${d.uso.slice().sort((a, b) => b.vezes - a.vezes).map((u) => `<tr><td>${esc(NOMES_EVENTO[u.evento] || u.evento)}</td><td class="n">${fmt(u.vezes)}</td><td class="n">${fmt(u.pessoas)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Sem uso registrado no período.</p>'}
        </section>
      </div>

      <section class="cartao">
        <header><h2>Retenção por semana de cadastro</h2><span class="faint">% da turma de cadastro ativa em cada semana seguinte</span></header>
        ${d.coortes.length ? `<div class="tab"><table class="coorte"><thead><tr><th>Turma (semana)</th><th>Contas</th>${[0, 1, 2, 3, 4].map((s) => `<th>${s === 0 ? 'Semana do cadastro' : `+${s} sem.`}</th>`).join('')}</tr></thead><tbody>${d.coortes.map((co) => `<tr><td>${diaCurto(co.coorte)}</td><td class="n">${fmt(co.n)}</td>${co.semanas.map((v) => {
          if (v == null) return '<td class="c faint">·</td>';
          const p = co.n ? v / co.n : 0; const nivel = Math.min(6, Math.max(1, Math.ceil(p * 6)));
          return `<td class="c" style="background:var(--seq-${nivel});color:${nivel >= 4 ? '#fff' : 'var(--ink)'}" title="${fmt(v)} de ${fmt(co.n)}">${fmt(p * 100)}%</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div><p class="faint">Leia por linha: de quem se cadastrou naquela semana, quantos % voltaram nas semanas seguintes. Turmas antigas podem aparecer baixas porque a atividade começou a ser medida em ${d.desde_atividade ? diaCurto(d.desde_atividade) : '–'}.</p>` : '<p class="vazio">Ainda não há turmas de cadastro suficientes.</p>'}
      </section>

      <section class="cartao">
        <header><h2>Erros</h2><span class="faint">agrupados por mensagem · textos sem dados pessoais</span></header>
        <p class="leitura">Últimas 24 h: servidor <b>${fmt(d.erros.ultimas24.servidor ?? 0)}</b> · tela do app <b>${fmt(d.erros.ultimas24.app ?? 0)}</b> · notificações <b>${fmt(d.erros.ultimas24.push ?? 0)}</b> · lembretes automáticos <b>${fmt(d.erros.ultimas24.cron ?? 0)}</b>.</p>
        ${d.erros.lista.length ? `<div class="tab"><table><thead><tr><th>Origem</th><th>Onde</th><th>Mensagem</th><th>Vezes</th><th>Última</th><th>Versão</th></tr></thead><tbody>${d.erros.lista.map((e) => `<tr><td><span class="pill p-${esc(e.origem)}">${esc({ servidor: 'Servidor', app: 'Tela do app', push: 'Notificação', cron: 'Lembretes' }[e.origem] || e.origem)}</span></td><td><code>${esc(e.rota || '–')}</code>${e.status ? ` <span class="faint">${esc(e.status)}</span>` : ''}${e.plataformas ? `<br><span class="faint">${esc(e.plataformas)}</span>` : ''}</td><td class="msg">${esc(e.mensagem)}</td><td class="n">${fmt(e.n)}</td><td class="n">${quando(e.ultimo)}</td><td>${esc(e.versao || '–')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhum erro registrado no período. 🎉</p>'}
      </section>

      <div class="grade">
        <section class="cartao">
          <header><h2>Sistema</h2></header>
          <div class="fatos">
            <div class="fato"><div class="rot">Lembretes automáticos</div><div class="val">${!cron ? '<span class="status st-aviso">Sem registro</span>' : cron.valor === 'erro' ? '<span class="status st-erro">Falhou</span>' : minCron > 40 ? '<span class="status st-erro">Parado</span>' : '<span class="status st-ok">Rodando</span>'}</div><div class="faint">${cron ? `última rodada ${haQuanto(cron.at)}` : 'roda a cada 15 min'}</div></div>
            <div class="fato"><div class="rot">Versão do app em uso</div><div class="val">${esc(d.sistema.versao_app?.valor || '–')}</div><div class="faint">${d.sistema.versao_app ? `vista ${haQuanto(d.sistema.versao_app.at)}` : ''}</div></div>
            <div class="fato"><div class="rot">Aparelhos com notificação</div><div class="val">${fmt(d.banco.aparelhos_push)}</div></div>
            <div class="fato"><div class="rot">Contas de exemplo ativas</div><div class="val">${fmt(k.contas_exemplo)}</div><div class="faint">apagadas em 24 h</div></div>
          </div>
          <p class="faint">Volume no banco: ${fmt(d.banco.contas)} contas · ${fmt(d.banco.bebes)} bebês · ${fmt(d.banco.registros)} registros · ${fmt(d.banco.fotos)} fotos · ${fmt(d.banco.erros)} erros guardados.</p>
        </section>
        <section class="cartao">
          <header><h2>Eventos de conta no período</h2></header>
          ${Object.keys(d.contadores).length ? `<div class="tab"><table><tbody>${Object.entries(d.contadores).sort((a, b) => b[1] - a[1]).map(([kk, v]) => `<tr><td>${esc(NOMES_CONT[kk] || kk)}</td><td class="n">${fmt(v)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Sem eventos de conta no período.</p>'}
        </section>
      </div>
      <p class="faint">Gerado em ${quando(d.gerado_em)} · período ${diaCurto(d.periodo.ini)} a ${diaCurto(d.periodo.fim)}.</p>`;

    const rot = (dia) => diaCurto(dia);
    linha(document.getElementById('g-ativos'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: x.ativos, dica: `${diaCurto(x.dia)}: <b>${fmt(x.ativos)}</b> ativos` })));
    barras(document.getElementById('g-cadastros'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: x.cadastros, dica: `${diaCurto(x.dia)}: <b>${fmt(x.cadastros)}</b> cadastros` })), { cor: 'var(--s2)' });
    barras(document.getElementById('g-registros'), d.serie.map((x) => ({ rotulo: rot(x.dia), v: x.registros, dica: `${diaCurto(x.dia)}: <b>${fmt(x.registros)}</b> registros` })), { altura: 170 });
    const horas = preencherHoras(d.estabilidade.horas);
    barras(document.getElementById('g-req'), horas.map((h) => ({ rotulo: h.rotulo, v: h.n, dica: `${h.titulo}: <b>${fmt(h.n)}</b> requisições${h.e5 ? ` · ${fmt(h.e5)} erros` : ''}` })));
    linha(document.getElementById('g-erro'), horas.map((h) => ({ rotulo: h.rotulo, v: h.n ? (h.e5 / h.n) * 100 : 0, dica: `${h.titulo}: <b>${h.n ? fmt((h.e5 / h.n) * 100, 1) : 0}%</b> de erro (${fmt(h.e5)} de ${fmt(h.n)}) · ${h.n ? fmt(h.ms / h.n) : 0} ms` })), { cor: 'var(--critical)', formato: (v) => `${fmt(v, v < 10 && v % 1 ? 1 : 0)}%`, maxFixo: Math.max(4, ...horas.map((h) => (h.n ? (h.e5 / h.n) * 100 : 0))) });
  }

  let redim;
  window.addEventListener('resize', () => { clearTimeout(redim); redim = setTimeout(() => { if (estado.dados && document.getElementById('g-ativos')) renderizar(estado.dados); }, 200); });

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
