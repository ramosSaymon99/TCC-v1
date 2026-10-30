// Tela de login: valida os campos, envia à API e abre a aplicação.
import { api } from './api.js';

const form = document.getElementById('form-login');
const erro = form.querySelector('.erro-login');
const senha = document.getElementById('senha');
const botaoMostrar = form.querySelector('.mostrar-senha');
const voltar = new URLSearchParams(location.search).get('voltar') || '';
// Só aceita voltar para uma tela da própria aplicação.
const destino = `./${/^#\/[\w?=&%.-]*$/.test(voltar) ? voltar : '#/inicio'}`;

const mostrarErro = (mensagem) => {
  erro.textContent = mensagem;
  erro.hidden = !mensagem;
};

// Quem já tem sessão válida vai direto para a aplicação.
fetch('/api/sessao').then((r) => r.ok && location.replace(destino)).catch(() => {});

botaoMostrar.addEventListener('click', () => {
  const visivel = senha.type === 'text';
  senha.type = visivel ? 'password' : 'text';
  botaoMostrar.textContent = visivel ? 'Mostrar' : 'Ocultar';
  botaoMostrar.setAttribute('aria-pressed', String(!visivel));
  senha.focus();
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mostrarErro('');
  if (!form.reportValidity()) return;
  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;
  botao.textContent = 'Entrando…';
  try {
    const usuario = await api.login(form.email.value, senha.value);
    location.replace(usuario.trocar_senha ? './#/senha' : destino);
  } catch (e) {
    mostrarErro(e.message);
    senha.value = '';
    senha.focus();
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});
