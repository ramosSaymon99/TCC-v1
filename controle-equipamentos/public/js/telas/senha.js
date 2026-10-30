// Tela Alterar senha (obrigatória no primeiro acesso com senha provisória).
import { api } from '../api.js';
import { enviar, aviso, sessao } from '../ui.js';

export async function renderizar(raiz) {
  const obrigatoria = sessao.usuario.trocar_senha;
  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Alterar senha</h1>
        <p>${obrigatoria ? 'Sua senha é provisória. Defina uma senha pessoal para começar a usar o sistema.' : 'Defina uma nova senha de acesso.'}</p></div>
    </div>
    <form class="cartao" novalidate style="max-width:520px">
      <div class="campos" style="grid-template-columns:1fr">
        <div class="campo">
          <label class="obrigatorio" for="atual">Senha atual${obrigatoria ? ' (provisória)' : ''}</label>
          <input id="atual" type="password" required maxlength="128" autocomplete="current-password">
        </div>
        <div class="campo">
          <label class="obrigatorio" for="nova">Nova senha</label>
          <input id="nova" type="password" required minlength="8" maxlength="128" autocomplete="new-password"
            pattern="(?=.*[A-Za-z])(?=.*\\d).{8,}" title="Ao menos 8 caracteres, com letras e números">
          <span class="dica">Ao menos 8 caracteres, com letras e números.</span>
        </div>
        <div class="campo">
          <label class="obrigatorio" for="confirmacao">Confirme a nova senha</label>
          <input id="confirmacao" type="password" required maxlength="128" autocomplete="new-password">
        </div>
      </div>
      <div class="rodape-form">
        <span class="erro-campo erro-form"></span>
        <button class="botao" type="submit">Salvar nova senha</button>
      </div>
    </form>`;

  const form = raiz.querySelector('form');
  const [atual, nova, confirmacao] = ['#atual', '#nova', '#confirmacao'].map((s) => form.querySelector(s));
  const conferir = () => confirmacao.setCustomValidity(confirmacao.value && confirmacao.value !== nova.value ? 'As senhas não conferem.' : '');
  nova.addEventListener('input', conferir);
  confirmacao.addEventListener('input', conferir);
  atual.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    conferir();
    const ok = await enviar(form, () => api.trocarSenha(atual.value, nova.value));
    if (!ok) return;
    sessao.usuario.trocar_senha = false;
    aviso('Senha alterada com sucesso.', 'sucesso');
    location.hash = '#/inicio';
  });
}
