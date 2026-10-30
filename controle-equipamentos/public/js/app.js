// Navegação entre as telas (rotas pelo endereço após o #).
import { api } from './api.js';
import { mostrarErro, sessao } from './ui.js';
import * as inicio from './telas/inicio.js';
import * as cadastro from './telas/cadastro.js';
import * as entrega from './telas/entrega.js';
import * as devolucao from './telas/devolucao.js';
import * as troca from './telas/troca.js';
import * as estoque from './telas/estoque.js';
import * as usuarios from './telas/usuarios.js';
import * as senha from './telas/senha.js';

const telas = { inicio, cadastro, entrega, devolucao, troca, estoque, usuarios, senha };
const SOMENTE_ADMINISTRADOR = ['usuarios'];
const conteudo = document.getElementById('conteudo');
const menu = document.getElementById('menu');
const botaoMenu = document.querySelector('.menu-botao');

async function abrir() {
  const [caminho, busca = ''] = location.hash.replace(/^#\/?/, '').split('?');
  let nome = telas[caminho] ? caminho : 'inicio';
  if (SOMENTE_ADMINISTRADOR.includes(nome) && sessao.usuario.perfil !== 'administrador') nome = 'inicio';
  // Com senha provisória, só a tela de troca de senha fica acessível.
  if (sessao.usuario.trocar_senha) nome = 'senha';
  const params = Object.fromEntries(new URLSearchParams(busca));

  menu.querySelectorAll('a[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === nome));
  menu.classList.remove('aberto');
  botaoMenu.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.painel, .painel-fundo').forEach((el) => el.remove());

  // Cada abertura desenha em uma área nova: se a tela anterior ainda terminar de carregar, ela não sobrescreve esta.
  const area = document.createElement('div');
  area.innerHTML = '<p class="carregando">Carregando…</p>';
  conteudo.replaceChildren(area);
  try {
    await telas[nome].renderizar(area, params);
    document.title = `${conteudo.querySelector('h1')?.textContent ?? 'Início'} · Controle de Equipamentos`;
  } catch (erro) {
    area.innerHTML = `<div class="cartao"><h2>Não foi possível carregar a tela</h2><p class="suave mt">${erro.message}</p></div>`;
    mostrarErro(erro);
  }
  conteudo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

botaoMenu.addEventListener('click', () => {
  const aberto = menu.classList.toggle('aberto');
  botaoMenu.setAttribute('aria-expanded', String(aberto));
});

menu.querySelector('[data-sair]').addEventListener('click', async () => {
  await api.logout().catch(() => {});
  location.replace('login.html');
});

// A aplicação só abre com uma sessão válida; sem ela, api.js leva para o login.
sessao.usuario = await api.sessao();
const { usuario } = sessao;
menu.querySelector('[data-usuario-nome]').textContent = usuario.nome;
menu.querySelector('[data-usuario-perfil]').textContent = `${usuario.perfis[usuario.perfil]} · ${usuario.email}`;
menu.querySelectorAll('[data-perfil]').forEach((el) => (el.hidden = el.dataset.perfil !== usuario.perfil));

window.addEventListener('hashchange', abrir);
if (!location.hash) history.replaceState(null, '', '#/inicio');
abrir();
