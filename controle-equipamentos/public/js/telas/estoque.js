// Tela Estoque e histórico: pesquisa de aparelhos, detalhe com linha do tempo e avaliação técnica.
import { api } from '../api.js';
import {
  esc, opcoes, selo, dataBR, dias, numero, enviar, aviso, lerFormulario, camposComuns, exportarCsv,
} from '../ui.js';
import { rotuloMov } from './inicio.js';

const LIMITE_LINHAS = 300;

export async function renderizar(raiz, params) {
  const op = await opcoes();
  const filtros = { busca: params.busca || '', tipo: params.tipo || '', situacao: params.situacao || '' };

  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Estoque e histórico</h1><p>Pesquise por número de série, modelo, marca ou código do cliente. Clique em um aparelho para ver as movimentações.</p></div>
      <button class="botao secundario" type="button" data-exportar>Exportar CSV</button>
    </div>
    <section class="cartao">
      <form class="filtros" role="search">
        <input type="search" name="busca" placeholder="Nº de série, modelo, marca ou cliente" aria-label="Pesquisar" value="${esc(filtros.busca)}">
        <select name="tipo" aria-label="Tipo"><option value="">Todos os tipos</option>
          ${op.tipos.map((t) => `<option ${t === filtros.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select name="situacao" aria-label="Situação"><option value="">Todas as situações</option>
          ${Object.entries(op.situacoes).map(([v, r]) => `<option value="${v}" ${v === filtros.situacao ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <button class="botao secundario" type="reset">Limpar</button>
      </form>
      <div class="chips" data-chips></div>
      <div class="tabela-rolagem"><table>
        <thead><tr><th>Nº de série</th><th>Equipamento</th><th>Situação</th><th>Cliente</th><th>Desde</th><th class="d">Há</th></tr></thead>
        <tbody data-linhas><tr><td colspan="6" class="vazio">Carregando…</td></tr></tbody>
      </table></div>
      <p class="fraco mt" data-rodape></p>
    </section>`;

  const form = raiz.querySelector('.filtros');
  let todos = [];
  let visiveis = [];

  const sincronizarEndereco = (extra = {}) => {
    const q = new URLSearchParams(Object.entries({ ...filtros, ...extra }).filter(([, v]) => v));
    history.replaceState(null, '', `#/estoque${q.toString() ? `?${q}` : ''}`);
  };

  const desenhar = () => {
    visiveis = filtros.situacao ? todos.filter((e) => e.situacao === filtros.situacao) : todos;
    const contagem = Object.fromEntries(Object.keys(op.situacoes).map((s) => [s, todos.filter((e) => e.situacao === s).length]));
    raiz.querySelector('[data-chips]').innerHTML =
      `<button type="button" class="chip ${filtros.situacao ? '' : 'ativo'}" data-s="">Todas<strong>${numero(todos.length)}</strong></button>` +
      Object.entries(op.situacoes)
        .map(([s, r]) => `<button type="button" class="chip ${filtros.situacao === s ? 'ativo' : ''}" data-s="${s}">${esc(r)}<strong>${numero(contagem[s])}</strong></button>`)
        .join('');
    raiz.querySelectorAll('[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        filtros.situacao = b.dataset.s;
        form.situacao.value = b.dataset.s;
        sincronizarEndereco();
        desenhar();
      })
    );

    raiz.querySelector('[data-linhas]').innerHTML = visiveis.length
      ? visiveis
          .slice(0, LIMITE_LINHAS)
          .map(
            (e) => `<tr class="clicavel" data-id="${e.id}" tabindex="0">
              <td class="mono">${esc(e.numero_serie)}</td>
              <td>${esc(e.tipo)} · ${esc(e.marca)} ${esc(e.modelo)}</td>
              <td>${selo(e.situacao, op.situacoes)}</td>
              <td>${esc(e.cliente_codigo || '—')}</td>
              <td class="num">${dataBR(e.situacao_desde)}</td>
              <td class="d num">${dias(e.dias_na_situacao)}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="vazio">Nenhum equipamento encontrado com esses filtros.</td></tr>';
    raiz.querySelector('[data-rodape]').textContent =
      visiveis.length > LIMITE_LINHAS
        ? `Mostrando ${LIMITE_LINHAS} de ${numero(visiveis.length)} equipamentos. Refine a pesquisa ou exporte o CSV para ver todos.`
        : `${numero(visiveis.length)} equipamento(s).`;
    raiz.querySelectorAll('tr[data-id]').forEach((tr) => {
      const abrirDetalhe = () => detalhe(tr.dataset.id, op, recarregar, sincronizarEndereco);
      tr.addEventListener('click', abrirDetalhe);
      tr.addEventListener('keydown', (ev) => ev.key === 'Enter' && abrirDetalhe());
    });
  };

  const recarregar = async () => {
    todos = await api.equipamentos({ busca: filtros.busca, tipo: filtros.tipo });
    desenhar();
  };

  let espera;
  form.addEventListener('input', (ev) => {
    filtros.busca = form.busca.value;
    filtros.tipo = form.tipo.value;
    const mudouSituacao = filtros.situacao !== form.situacao.value;
    filtros.situacao = form.situacao.value;
    sincronizarEndereco();
    clearTimeout(espera);
    if (mudouSituacao) desenhar();
    else espera = setTimeout(recarregar, ev.target.name === 'busca' ? 250 : 0);
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
  form.addEventListener('reset', () => {
    Object.assign(filtros, { busca: '', tipo: '', situacao: '' });
    sincronizarEndereco();
    setTimeout(recarregar);
  });

  raiz.querySelector('[data-exportar]').addEventListener('click', () =>
    exportarCsv(`equipamentos-${new Date().toISOString().slice(0, 10)}.csv`, [
      { titulo: 'Número de série', valor: (e) => e.numero_serie },
      { titulo: 'Tipo', valor: (e) => e.tipo },
      { titulo: 'Marca', valor: (e) => e.marca },
      { titulo: 'Modelo', valor: (e) => e.modelo },
      { titulo: 'Situação', valor: (e) => op.situacoes[e.situacao] },
      { titulo: 'Cliente', valor: (e) => e.cliente_codigo },
      { titulo: 'Desde', valor: (e) => dataBR(e.situacao_desde) },
      { titulo: 'Dias na situação', valor: (e) => e.dias_na_situacao },
      { titulo: 'Observação', valor: (e) => e.observacao },
    ], visiveis)
  );

  await recarregar();
  if (params.id) detalhe(params.id, op, recarregar, sincronizarEndereco);
}

async function detalhe(id, op, aoAlterar, sincronizarEndereco) {
  document.querySelectorAll('.painel, .painel-fundo').forEach((el) => el.remove());
  const tela = document.querySelector('#conteudo > div');
  const e = await api.equipamento(id);
  if (tela !== document.querySelector('#conteudo > div')) return; // o usuário já mudou de tela
  sincronizarEndereco({ id: e.id });
  document.querySelectorAll('tr[data-id]').forEach((tr) => tr.classList.toggle('selecionada', tr.dataset.id === String(e.id)));

  const fundo = Object.assign(document.createElement('div'), { className: 'painel-fundo' });
  const painel = Object.assign(document.createElement('aside'), { className: 'painel' });
  painel.setAttribute('aria-label', `Equipamento ${e.numero_serie}`);
  const podeAvaliar = ['aguardando_avaliacao', 'em_manutencao'].includes(e.situacao);
  const acoes = {
    disponivel: `<a class="botao pequeno" href="#/entrega?id=${e.id}">Entregar</a>`,
    com_cliente: `<a class="botao pequeno" href="#/devolucao?id=${e.id}">Devolução</a><a class="botao secundario pequeno" href="#/troca?id=${e.id}">Troca</a>`,
  }[e.situacao] || '';

  painel.innerHTML = `
    <header>
      <div><p class="fraco">${esc(e.tipo)} · ${esc(e.marca)} ${esc(e.modelo)}</p><h2 class="mono">${esc(e.numero_serie)}</h2></div>
      <button class="botao secundario pequeno" type="button" data-fechar aria-label="Fechar">✕</button>
    </header>
    <div class="corpo">
      <div class="previa"><span>${selo(e.situacao, op.situacoes)} <span class="suave">há ${dias(e.dias_na_situacao)}</span></span>
        <span class="acoes">${acoes}<a class="botao secundario pequeno" href="#/cadastro?id=${e.id}">Editar</a></span></div>
      <dl class="dados">
        <div><dt>Cliente atual</dt><dd>${esc(e.cliente_codigo || '—')}</dd></div>
        <div><dt>Na situação desde</dt><dd>${dataBR(e.situacao_desde)}</dd></div>
        <div><dt>Entregas</dt><dd>${e.historico.filter((m) => m.tipo === 'entrega').length}</dd></div>
        <div><dt>Devoluções por defeito/queima</dt><dd>${e.historico.filter((m) => m.tipo === 'devolucao' && ['defeito_relatado', 'queima_relatada'].includes(m.motivo)).length}</dd></div>
        ${e.observacao ? `<div style="grid-column:1/-1"><dt>Observação do cadastro</dt><dd>${esc(e.observacao)}</dd></div>` : ''}
      </dl>
      ${podeAvaliar ? formularioAvaliacao(e, op) : ''}
      <section><h3>Histórico de movimentações</h3>
        <ul class="linha-tempo mt">${e.historico.map((m) => itemHistorico(m, op)).join('')}</ul>
      </section>
    </div>`;

  const fechar = () => {
    painel.remove();
    fundo.remove();
    sincronizarEndereco();
    document.querySelectorAll('tr.selecionada').forEach((tr) => tr.classList.remove('selecionada'));
    document.removeEventListener('keydown', aoTeclar);
  };
  const aoTeclar = (ev) => ev.key === 'Escape' && fechar();
  fundo.addEventListener('click', fechar);
  painel.querySelector('[data-fechar]').addEventListener('click', fechar);
  document.addEventListener('keydown', aoTeclar);
  painel.querySelectorAll('[data-ir]').forEach((a) =>
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      detalhe(a.dataset.ir, op, aoAlterar, sincronizarEndereco);
    })
  );

  const form = painel.querySelector('form');
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = { ...lerFormulario(form), equipamento_id: e.id };
    const r = await enviar(form, () => api.avaliar(dados));
    if (!r) return;
    aviso(`Avaliação registrada: ${r.numero_serie} → ${op.situacoes[r.situacao]}.`, 'sucesso');
    await Promise.all([opcoes(true), aoAlterar()]);
    detalhe(e.id, op, aoAlterar, sincronizarEndereco);
  });
  form?.querySelectorAll('input[name="resultado"]').forEach((r) =>
    r.addEventListener('change', () => {
      const baixa = r.value === 'baixado';
      const obs = form.querySelector('#observacao');
      obs.required = baixa;
      form.querySelector('label[for="observacao"]').textContent = baixa ? 'Motivo da baixa' : 'Laudo / observação';
      form.querySelector('label[for="observacao"]').classList.toggle('obrigatorio', baixa);
    })
  );

  document.body.append(fundo, painel);
  painel.querySelector('[data-fechar]').focus();
}

function formularioAvaliacao(e, op) {
  const resultados = ['disponivel', 'em_manutencao', 'baixado'].filter((s) => s !== e.situacao);
  const ultimaDevolucao = e.historico.find((m) => m.tipo === 'devolucao');
  return `
    <form class="cartao" novalidate style="box-shadow:none">
      <h3>Avaliação técnica</h3>
      ${ultimaDevolucao ? `<p class="fraco" style="margin:4px 0 12px">Devolvido por <strong>${esc(op.motivos[ultimaDevolucao.motivo])}</strong> ·
        condição: ${esc(op.condicoes[ultimaDevolucao.condicao] || '—')}</p>` : ''}
      <div class="campos">
        <fieldset class="campo inteiro"><legend class="obrigatorio">Resultado</legend>
          <div class="opcoes">${resultados
            .map((s, i) => `<label><input type="radio" name="resultado" value="${s}" ${i === 0 ? 'required' : ''}>${esc(
              { disponivel: 'Aprovado → disponível', em_manutencao: 'Enviar para manutenção', baixado: 'Baixar (descarte)' }[s]
            )}</label>`)
            .join('')}</div>
        </fieldset>
        ${camposComuns(op, { rotuloObs: 'Laudo / observação', minData: e.situacao_desde })}
      </div>
      <div class="rodape-form"><span class="erro-campo erro-form"></span><button class="botao" type="submit">Registrar avaliação</button></div>
    </form>`;
}

function itemHistorico(m, op) {
  const partes = [];
  if (m.cliente_codigo) partes.push(`Cliente ${esc(m.cliente_codigo)}`);
  if (m.condicao) partes.push(`Condição: ${esc(op.condicoes[m.condicao])}`);
  if (m.troca_outro_serie) {
    const verbo = m.tipo === 'devolucao' ? 'Substituído por' : 'Substituiu';
    partes.push(`${verbo} <a href="#" data-ir="${m.troca_outro_id}" class="mono">${esc(m.troca_outro_serie)}</a>`);
  }
  if (m.situacao_nova && !['cadastro', 'avaliacao'].includes(m.tipo)) partes.push(`→ ${esc(op.situacoes[m.situacao_nova])}`);
  return `<li class="t-${m.tipo}">
    <div class="quando">${dataBR(m.data)} · ${esc(m.responsavel)}${
      m.registrado_por && m.registrado_por !== m.responsavel ? ` · lançado por ${esc(m.registrado_por)}` : ''}</div>
    <strong>${rotuloMov(m, op)}</strong>
    ${partes.length ? `<div class="detalhe">${partes.join(' · ')}</div>` : ''}
    ${m.observacao ? `<div class="detalhe">“${esc(m.observacao)}”</div>` : ''}
  </li>`;
}
