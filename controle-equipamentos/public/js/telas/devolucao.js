// Tela Devolução: registra o aparelho recebido, o motivo e a condição informada.
import { api } from '../api.js';
import { esc, opcoes, camposComuns, enviar, aviso, lerFormulario, seletorEquipamento, dataBR } from '../ui.js';

export async function renderizar(raiz, params) {
  const [op, comClientes] = await Promise.all([opcoes(), api.equipamentos({ situacao: 'com_cliente' })]);
  const seletor = seletorEquipamento({
    nome: 'equipamento_id',
    rotulo: 'Equipamento recebido',
    dica: 'Só aparelhos que estão com clientes podem ser devolvidos.',
    lista: comClientes,
    rotulos: op.situacoes,
  });

  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Devolução</h1>
        <p>Registre o aparelho recebido. Ele vai para “Aguardando avaliação” e só volta a ficar disponível depois de avaliado.</p></div>
    </div>
    <div class="grade grade-form">
      <form class="cartao" novalidate>
        <div class="campos">
          ${seletor.html}
          <fieldset class="campo inteiro">
            <legend class="obrigatorio">Motivo da devolução</legend>
            <div class="opcoes">${Object.entries(op.motivos)
              .map(([v, r], i) => `<label><input type="radio" name="motivo" value="${v}" ${i === 0 ? 'required' : ''}>${esc(r)}</label>`)
              .join('')}</div>
            <div class="nota mt" data-dica-troca hidden>Se outro aparelho for entregue no lugar, use a tela
              <a href="#/troca">Troca</a> para registrar as duas movimentações juntas.</div>
          </fieldset>
          <div class="campo inteiro">
            <label class="obrigatorio" for="condicao">Condição informada na recepção</label>
            <select id="condicao" name="condicao" required>
              <option value="">Selecione…</option>
              ${Object.entries(op.condicoes).map(([v, r]) => `<option value="${v}">${esc(r)}</option>`).join('')}
            </select>
          </div>
          ${camposComuns(op)}
        </div>
        <div class="rodape-form">
          <span class="erro-campo erro-form"></span>
          <button class="botao" type="submit">Registrar devolução</button>
        </div>
      </form>

      <section class="cartao" aria-labelledby="t-busca">
        <header><h2 id="t-busca">Buscar por cliente</h2></header>
        <div class="campo">
          <label for="busca-cliente">Código do cliente</label>
          <input id="busca-cliente" autocomplete="off" placeholder="Ex.: 20481">
        </div>
        <div data-resultado class="mt"></div>
      </section>
    </div>`;

  const form = raiz.querySelector('form');
  const controle = seletor.ligar(form);
  const pre = comClientes.find((e) => String(e.id) === params.id);
  if (pre) controle.selecionar(pre.numero_serie);

  form.querySelectorAll('input[name="motivo"]').forEach((r) =>
    r.addEventListener('change', () => {
      form.querySelector('[data-dica-troca]').hidden = !['troca', 'defeito_relatado', 'queima_relatada'].includes(r.value);
    })
  );

  const busca = raiz.querySelector('#busca-cliente');
  const resultado = raiz.querySelector('[data-resultado]');
  busca.addEventListener('input', () => {
    const termo = busca.value.trim().toLowerCase();
    const achados = termo ? comClientes.filter((e) => e.cliente_codigo.toLowerCase() === termo) : [];
    resultado.innerHTML = !termo
      ? ''
      : achados.length
        ? `<div class="tabela-rolagem"><table><tbody>${achados
            .map((e) => `<tr><td class="mono">${esc(e.numero_serie)}</td><td>${esc(e.tipo)} · ${esc(e.modelo)}<br>
              <span class="fraco">desde ${dataBR(e.situacao_desde)}</span></td>
              <td class="d"><button type="button" class="botao secundario pequeno" data-serie="${esc(e.numero_serie)}">Selecionar</button></td></tr>`)
            .join('')}</tbody></table></div>`
        : '<p class="suave">Nenhum equipamento com este cliente.</p>';
    resultado.querySelectorAll('[data-serie]').forEach((b) => b.addEventListener('click', () => controle.selecionar(b.dataset.serie)));
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = lerFormulario(form);
    const e = await enviar(form, () => api.devolver(dados));
    if (!e) return;
    aviso(`Devolução registrada: ${e.numero_serie} aguardando avaliação.`, 'sucesso');
    await opcoes(true);
    renderizar(raiz, {});
  });
}
