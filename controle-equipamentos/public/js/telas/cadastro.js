// Tela Cadastro de equipamentos: um aparelho ou um lote inteiro (um número de série por linha).
import { api } from '../api.js';
import { esc, opcoes, datalist, camposComuns, enviar, aviso, lerFormulario, lembrarResponsavel, dataBR, selo } from '../ui.js';

export async function renderizar(raiz, params) {
  if (params.id) return editar(raiz, params.id);

  const op = await opcoes();
  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Cadastro de equipamentos</h1>
        <p>Registre aparelhos recebidos do fornecedor. Para um lote do mesmo modelo, informe um número de série por linha
        (o leitor de código de barras pode ser usado direto no campo).</p></div>
    </div>
    <div class="grade grade-form">
      <form class="cartao" novalidate>
        <div class="campos">
          <div class="campo">
            <label class="obrigatorio" for="tipo">Tipo</label>
            <input id="tipo" name="tipo" required maxlength="40" list="l-tipos" placeholder="Ex.: ONU, Roteador Wi-Fi" autocomplete="off">
            ${datalist('l-tipos', op.tipos.length ? op.tipos : ['ONU', 'ONT', 'Roteador Wi-Fi', 'Repetidor Mesh'])}
          </div>
          <div class="campo">
            <label class="obrigatorio" for="marca">Marca</label>
            <input id="marca" name="marca" required maxlength="60" list="l-marcas" autocomplete="off">
            ${datalist('l-marcas', op.marcas)}
          </div>
          <div class="campo inteiro">
            <label class="obrigatorio" for="modelo">Modelo</label>
            <input id="modelo" name="modelo" required maxlength="60" list="l-modelos" autocomplete="off">
            ${datalist('l-modelos', op.modelos)}
          </div>
          <div class="campo inteiro">
            <label class="obrigatorio" for="numeros">Número(s) de série</label>
            <textarea id="numeros" name="numeros" class="mono" required rows="5" spellcheck="false"
              placeholder="Um número de série por linha"></textarea>
            <span class="dica" data-contagem>0 números de série</span>
          </div>
          ${camposComuns(op)}
        </div>
        <div class="rodape-form">
          <span class="erro-campo erro-form"></span>
          <button class="botao" type="submit">Cadastrar</button>
        </div>
      </form>

      <section class="cartao" aria-labelledby="t-recentes">
        <header><h2 id="t-recentes">Cadastrados recentemente</h2><a href="#/estoque">Ver estoque</a></header>
        <div data-recentes><p class="carregando">Carregando…</p></div>
      </section>
    </div>`;

  const form = raiz.querySelector('form');
  const numeros = form.querySelector('#numeros');
  const contagem = form.querySelector('[data-contagem]');
  const lista = () => numeros.value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  numeros.addEventListener('input', () => {
    const itens = lista();
    const repetidos = itens.length - new Set(itens.map((s) => s.toUpperCase())).size;
    contagem.textContent = `${itens.length} número(s) de série${repetidos ? ` · ${repetidos} repetido(s) na lista` : ''}`;
    contagem.style.color = repetidos ? 'var(--perigo)' : '';
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = lerFormulario(form);
    const resultado = await enviar(form, () => api.cadastrar({ ...dados, numeros_serie: lista() }));
    if (!resultado) return;
    lembrarResponsavel(dados.responsavel);
    aviso(`${resultado.ids.length} equipamento(s) cadastrado(s) como disponível.`, 'sucesso');
    numeros.value = '';
    numeros.dispatchEvent(new Event('input'));
    numeros.focus();
    await opcoes(true);
    carregarRecentes(raiz);
  });

  carregarRecentes(raiz);
}

async function carregarRecentes(raiz) {
  const movs = await api.movimentacoes({ tipo: 'cadastro', limite: 12 });
  const alvo = raiz.querySelector('[data-recentes]');
  if (!alvo) return;
  alvo.innerHTML = movs.length
    ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Nº de série</th><th>Equipamento</th><th>Data</th></tr></thead>
        <tbody>${movs
          .map(
            (m) => `<tr class="clicavel" data-id="${m.equipamento_id}"><td class="mono">${esc(m.numero_serie)}</td>
              <td>${esc(m.equipamento_tipo)} · ${esc(m.marca)} ${esc(m.modelo)}</td><td class="num">${dataBR(m.data)}</td></tr>`
          )
          .join('')}</tbody></table></div>`
    : `<p class="vazio">Nenhum equipamento cadastrado ainda.</p>`;
  raiz.querySelectorAll('[data-recentes] tr[data-id]').forEach((tr) =>
    tr.addEventListener('click', () => (location.hash = `#/estoque?id=${tr.dataset.id}`))
  );
}

async function editar(raiz, id) {
  const [e, op] = await Promise.all([api.equipamento(id), opcoes()]);
  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Editar equipamento</h1>
        <p>Corrija dados de cadastro. A situação só muda por entrega, devolução, troca ou avaliação, para manter o histórico confiável.</p></div>
      <a class="botao secundario" href="#/estoque?id=${e.id}">Voltar ao histórico</a>
    </div>
    <form class="cartao" novalidate style="max-width:760px">
      <div class="previa" style="margin-bottom:16px"><span>Situação atual</span>${selo(e.situacao, op.situacoes)}</div>
      <div class="campos">
        <div class="campo"><label class="obrigatorio" for="tipo">Tipo</label>
          <input id="tipo" name="tipo" required maxlength="40" list="l-tipos" value="${esc(e.tipo)}">${datalist('l-tipos', op.tipos)}</div>
        <div class="campo"><label class="obrigatorio" for="marca">Marca</label>
          <input id="marca" name="marca" required maxlength="60" list="l-marcas" value="${esc(e.marca)}">${datalist('l-marcas', op.marcas)}</div>
        <div class="campo"><label class="obrigatorio" for="modelo">Modelo</label>
          <input id="modelo" name="modelo" required maxlength="60" list="l-modelos" value="${esc(e.modelo)}">${datalist('l-modelos', op.modelos)}</div>
        <div class="campo"><label class="obrigatorio" for="numero_serie">Número de série</label>
          <input id="numero_serie" name="numero_serie" class="mono" required maxlength="60" pattern="\\S+" value="${esc(e.numero_serie)}"></div>
        <div class="campo inteiro"><label for="observacao">Observação</label>
          <textarea id="observacao" name="observacao" maxlength="500" rows="3">${esc(e.observacao || '')}</textarea></div>
      </div>
      <div class="rodape-form">
        <span class="erro-campo erro-form"></span>
        <button class="botao" type="submit">Salvar alterações</button>
      </div>
    </form>`;

  const form = raiz.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const salvo = await enviar(form, () => api.atualizar(e.id, lerFormulario(form)));
    if (!salvo) return;
    aviso('Cadastro atualizado.', 'sucesso');
    await opcoes(true);
    location.hash = `#/estoque?id=${e.id}`;
  });
}
