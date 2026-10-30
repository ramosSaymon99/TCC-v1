// Tela Usuários (somente administrador): cadastro, perfil, ativação e redefinição de senha.
import { api } from '../api.js';
import { esc, enviar, aviso, lerFormulario, sessao } from '../ui.js';

const PERFIS = { administrador: 'Administrador', operador: 'Operador' };

const dataHora = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11, 16)}` : 'Nunca acessou');

export async function renderizar(raiz) {
  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Usuários</h1>
        <p>Quem pode acessar o sistema. Operadores registram movimentações; administradores também gerenciam usuários.</p></div>
    </div>
    <div class="grade grade-form">
      <section class="cartao" aria-labelledby="t-lista">
        <header><h2 id="t-lista">Usuários cadastrados</h2></header>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Nome</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead>
          <tbody data-linhas></tbody>
        </table></div>
      </section>
      <form class="cartao" novalidate data-form>
        <header><h2 data-titulo>Novo usuário</h2></header>
        <div class="campos" style="grid-template-columns:1fr">
          <div class="campo"><label class="obrigatorio" for="nome">Nome</label>
            <input id="nome" name="nome" required maxlength="80" autocomplete="off"></div>
          <div class="campo"><label class="obrigatorio" for="email">E-mail</label>
            <input id="email" name="email" type="email" required maxlength="120" autocomplete="off"></div>
          <fieldset class="campo"><legend class="obrigatorio">Perfil</legend>
            <div class="opcoes">${Object.entries(PERFIS)
              .map(([v, r]) => `<label><input type="radio" name="perfil" value="${v}" required ${v === 'operador' ? 'checked' : ''}>${r}</label>`)
              .join('')}</div></fieldset>
          <div class="campo"><label class="obrigatorio" for="senha" data-rotulo-senha>Senha provisória</label>
            <input id="senha" name="senha" type="password" required minlength="8" maxlength="128" autocomplete="new-password"
              pattern="(?=.*[A-Za-z])(?=.*\\d).{8,}" title="Ao menos 8 caracteres, com letras e números">
            <span class="dica" data-dica-senha>Ao menos 8 caracteres, com letras e números. O usuário troca a senha no primeiro acesso.</span></div>
          <label data-ativo hidden style="font-weight:500;display:flex;gap:8px;align-items:center">
            <input type="checkbox" name="ativo" style="width:auto;min-height:0"> Usuário ativo</label>
        </div>
        <div class="rodape-form">
          <span class="erro-campo erro-form"></span>
          <button class="botao secundario" type="button" data-cancelar hidden>Cancelar</button>
          <button class="botao" type="submit">Cadastrar usuário</button>
        </div>
      </form>
    </div>`;

  const form = raiz.querySelector('[data-form]');
  let editando = null;
  let lista = [];

  const preencher = (u) => {
    editando = u;
    form.reset();
    form.querySelector('.erro-form').textContent = '';
    form.querySelector('[data-titulo]').textContent = u ? `Editar ${u.nome}` : 'Novo usuário';
    form.querySelector('button[type="submit"]').textContent = u ? 'Salvar alterações' : 'Cadastrar usuário';
    form.querySelector('[data-cancelar]').hidden = !u;
    form.querySelector('[data-ativo]').hidden = !u;
    const senha = form.querySelector('#senha');
    senha.required = !u;
    form.querySelector('[data-rotulo-senha]').textContent = u ? 'Redefinir senha (opcional)' : 'Senha provisória';
    form.querySelector('[data-rotulo-senha]').classList.toggle('obrigatorio', !u);
    form.querySelector('[data-dica-senha]').textContent = u
      ? 'Preencha só para redefinir. A nova senha será provisória e as sessões abertas do usuário serão encerradas.'
      : 'Ao menos 8 caracteres, com letras e números. O usuário troca a senha no primeiro acesso.';
    if (u) {
      form.nome.value = u.nome;
      form.email.value = u.email;
      form.querySelector(`input[name="perfil"][value="${u.perfil}"]`).checked = true;
      form.ativo.checked = u.ativo;
    }
    form.nome.focus();
  };

  const carregar = async () => {
    lista = await api.usuarios();
    raiz.querySelector('[data-linhas]').innerHTML = lista
      .map(
        (u) => `<tr class="${u.ativo ? '' : 'inativo'}">
          <td><strong>${esc(u.nome)}</strong>${u.id === sessao.usuario.id ? ' <span class="fraco">(você)</span>' : ''}<br><span class="fraco">${esc(u.email)}</span></td>
          <td>${PERFIS[u.perfil]}</td>
          <td class="num">${dataHora(u.ultimo_acesso)}</td>
          <td>${u.ativo ? (u.trocar_senha ? '<span class="selo s-aguardando_avaliacao">Senha provisória</span>' : '<span class="selo s-disponivel">Ativo</span>') : '<span class="selo s-baixado">Inativo</span>'}</td>
          <td class="d"><button type="button" class="botao secundario pequeno" data-editar="${u.id}">Editar</button></td>
        </tr>`
      )
      .join('');
    raiz.querySelectorAll('[data-editar]').forEach((b) =>
      b.addEventListener('click', () => preencher(lista.find((u) => String(u.id) === b.dataset.editar)))
    );
  };

  form.querySelector('[data-cancelar]').addEventListener('click', () => preencher(null));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = lerFormulario(form);
    const salvo = await enviar(form, () =>
      editando
        ? api.atualizarUsuario(editando.id, {
            nome: dados.nome, email: dados.email, perfil: dados.perfil, ativo: form.ativo.checked, nova_senha: dados.senha || undefined,
          })
        : api.criarUsuario({ nome: dados.nome, email: dados.email, perfil: dados.perfil, senha: dados.senha })
    );
    if (!salvo) return;
    aviso(editando ? `Usuário ${salvo.nome} atualizado.` : `Usuário ${salvo.nome} cadastrado. Informe a senha provisória a ele.`, 'sucesso');
    preencher(null);
    carregar();
  });

  await carregar();
}
