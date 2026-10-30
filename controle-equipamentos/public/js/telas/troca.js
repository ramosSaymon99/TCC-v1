// Tela Troca: relaciona o equipamento devolvido ao novo equipamento entregue ao mesmo cliente.
import { api } from '../api.js';
import { esc, opcoes, camposComuns, enviar, aviso, lerFormulario, lembrarResponsavel, seletorEquipamento, numero } from '../ui.js';

const MOTIVOS_TROCA = ['defeito_relatado', 'queima_relatada', 'troca'];

export async function renderizar(raiz, params) {
  const [op, comClientes, disponiveis] = await Promise.all([
    opcoes(),
    api.equipamentos({ situacao: 'com_cliente' }),
    api.equipamentos({ situacao: 'disponivel' }),
  ]);
  let devolvido = null;
  let novo = null;

  const conferir = () => {
    const nota = raiz.querySelector('[data-conferencia]');
    const mensagens = [];
    if (devolvido) {
      const mesmoTipo = disponiveis.filter((e) => e.tipo === devolvido.tipo).length;
      mensagens.push(
        `<div class="nota">Cliente <strong>${esc(devolvido.cliente_codigo)}</strong>: o novo aparelho será registrado com ele.
          Há ${numero(mesmoTipo)} ${esc(devolvido.tipo)} disponível(is) para a troca.</div>`
      );
    }
    if (devolvido && novo && devolvido.tipo !== novo.tipo) {
      mensagens.push(`<div class="nota alerta">Tipos diferentes: sai ${esc(devolvido.tipo)} e entra ${esc(novo.tipo)}. Confirme se é um upgrade.</div>`);
    }
    nota.innerHTML = mensagens.join('');
  };

  const seletorDevolvido = seletorEquipamento({
    nome: 'equipamento_devolvido_id', rotulo: 'Número de série', lista: comClientes, rotulos: op.situacoes,
    aoSelecionar: (e) => { devolvido = e; conferir(); },
  });
  const seletorNovo = seletorEquipamento({
    nome: 'equipamento_entregue_id', rotulo: 'Número de série', lista: disponiveis, rotulos: op.situacoes,
    aoSelecionar: (e) => { novo = e; conferir(); },
  });

  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Troca</h1>
        <p>Registra em uma única operação a devolução do aparelho do cliente e a entrega do substituto, mantendo o vínculo entre os dois.</p></div>
    </div>
    <form class="cartao" novalidate>
      <div class="troca-lados">
        <div class="lado"><h3><span class="selo s-aguardando_avaliacao">Recebido</span> Equipamento devolvido</h3>${seletorDevolvido.html}</div>
        <div class="seta" aria-hidden="true">⇄</div>
        <div class="lado"><h3><span class="selo s-com_cliente">Entregue</span> Novo equipamento</h3>${seletorNovo.html}</div>
      </div>
      <div data-conferencia class="mt"></div>
      <div class="campos mt">
        <fieldset class="campo inteiro">
          <legend class="obrigatorio">Motivo da troca</legend>
          <div class="opcoes">${MOTIVOS_TROCA.map(
            (v, i) => `<label><input type="radio" name="motivo" value="${v}" ${i === 0 ? 'required' : ''}>${esc(v === 'troca' ? 'Solicitação / upgrade' : op.motivos[v])}</label>`
          ).join('')}</div>
        </fieldset>
        <div class="campo inteiro">
          <label class="obrigatorio" for="condicao">Condição informada do aparelho devolvido</label>
          <select id="condicao" name="condicao" required>
            <option value="">Selecione…</option>
            ${Object.entries(op.condicoes).map(([v, r]) => `<option value="${v}">${esc(r)}</option>`).join('')}
          </select>
        </div>
        ${camposComuns(op)}
      </div>
      <div class="rodape-form">
        <span class="fraco">O aparelho devolvido vai para “Aguardando avaliação”.</span>
        <span class="erro-campo erro-form"></span>
        <button class="botao" type="submit">Registrar troca</button>
      </div>
    </form>`;

  const form = raiz.querySelector('form');
  const [ladoDevolvido, ladoNovo] = form.querySelectorAll('.lado');
  const controleDevolvido = seletorDevolvido.ligar(ladoDevolvido);
  seletorNovo.ligar(ladoNovo);
  const pre = comClientes.find((e) => String(e.id) === params.id);
  if (pre) controleDevolvido.selecionar(pre.numero_serie);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = lerFormulario(form);
    const r = await enviar(form, () => api.trocar(dados));
    if (!r) return;
    lembrarResponsavel(dados.responsavel);
    aviso(`Troca registrada: ${r.devolvido.numero_serie} → ${r.entregue.numero_serie} (cliente ${r.entregue.cliente_codigo}).`, 'sucesso');
    await opcoes(true);
    renderizar(raiz, {});
  });
}
