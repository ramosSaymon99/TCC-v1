// Tela Entrega: registra qual equipamento saiu, para qual cliente, quando e quem entregou.
import { api } from '../api.js';
import { esc, opcoes, camposComuns, enviar, aviso, lerFormulario, lembrarResponsavel, seletorEquipamento, selo, dataBR } from '../ui.js';

export async function renderizar(raiz, params) {
  const [op, disponiveis] = await Promise.all([opcoes(), api.equipamentos({ situacao: 'disponivel' })]);
  const seletor = seletorEquipamento({
    nome: 'equipamento_id',
    rotulo: 'Equipamento',
    dica: `${disponiveis.length} equipamento(s) disponível(is). Só aparelhos disponíveis podem ser entregues.`,
    lista: disponiveis,
    rotulos: op.situacoes,
  });

  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Entrega</h1><p>Registre a saída de um equipamento para um cliente. O aparelho passa para a situação “Com cliente”.</p></div>
    </div>
    <div class="grade grade-form">
      <form class="cartao" novalidate>
        <div class="campos">
          ${seletor.html}
          <div class="campo inteiro">
            <label class="obrigatorio" for="cliente_codigo">Código do cliente</label>
            <input id="cliente_codigo" name="cliente_codigo" required maxlength="30" autocomplete="off" placeholder="Código no sistema do provedor">
          </div>
          ${camposComuns(op)}
        </div>
        <div class="rodape-form">
          <span class="erro-campo erro-form"></span>
          <button class="botao" type="submit">Registrar entrega</button>
        </div>
      </form>
      <section class="cartao" aria-labelledby="t-cliente">
        <header><h2 id="t-cliente">Equipamentos do cliente</h2></header>
        <div data-cliente><p class="suave">Informe o código do cliente para ver os aparelhos que já estão com ele.</p></div>
      </section>
    </div>`;

  const form = raiz.querySelector('form');
  const controle = seletor.ligar(form);
  const preSelecionado = disponiveis.find((e) => String(e.id) === params.id);
  if (preSelecionado) controle.selecionar(preSelecionado.numero_serie);
  if (!disponiveis.length) {
    form.querySelector('.erro-form').textContent = 'Não há equipamentos disponíveis. Cadastre ou avalie aparelhos devolvidos.';
  }

  const campoCliente = form.querySelector('#cliente_codigo');
  let espera;
  campoCliente.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => mostrarCliente(raiz, campoCliente.value.trim(), op), 350);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = lerFormulario(form);
    const e = await enviar(form, () => api.entregar(dados));
    if (!e) return;
    lembrarResponsavel(dados.responsavel);
    aviso(`Entrega registrada: ${e.numero_serie} com o cliente ${e.cliente_codigo}.`, 'sucesso');
    await opcoes(true);
    renderizar(raiz, {});
  });
}

async function mostrarCliente(raiz, codigo, op) {
  const alvo = raiz.querySelector('[data-cliente]');
  if (!alvo) return;
  if (!codigo) {
    alvo.innerHTML = '<p class="suave">Informe o código do cliente para ver os aparelhos que já estão com ele.</p>';
    return;
  }
  const c = await api.cliente(codigo);
  if (!alvo.isConnected) return;
  const ultimas = c.historico.slice(0, 5);
  alvo.innerHTML = `
    ${
      c.equipamentos.length
        ? `<div class="nota alerta">O cliente ${esc(codigo)} já possui ${c.equipamentos.length} equipamento(s). Confira se não é uma troca.</div>
           <div class="tabela-rolagem mt"><table><tbody>${c.equipamentos
             .map((e) => `<tr><td class="mono">${esc(e.numero_serie)}</td><td>${esc(e.tipo)} · ${esc(e.modelo)}</td><td>${selo(e.situacao, op.situacoes)}</td></tr>`)
             .join('')}</tbody></table></div>`
        : `<p class="suave">Nenhum equipamento com o cliente ${esc(codigo)} no momento.</p>`
    }
    ${
      ultimas.length
        ? `<h3 class="mt">Últimas movimentações</h3><ul class="linha-tempo mt">${ultimas
            .map((m) => `<li class="t-${m.tipo}"><div class="quando">${dataBR(m.data)}</div>
              ${m.tipo === 'entrega' ? 'Entrega' : `Devolução · ${esc(op.motivos[m.motivo])}`} — <span class="mono">${esc(m.numero_serie)}</span></li>`)
            .join('')}</ul>`
        : ''
    }`;
}
