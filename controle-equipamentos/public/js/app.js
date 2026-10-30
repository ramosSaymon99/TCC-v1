// Navegação entre as telas (rotas pelo endereço após o #).
import { mostrarErro } from './ui.js';
import * as inicio from './telas/inicio.js';
import * as cadastro from './telas/cadastro.js';
import * as entrega from './telas/entrega.js';
import * as devolucao from './telas/devolucao.js';
import * as troca from './telas/troca.js';
import * as estoque from './telas/estoque.js';

const telas = { inicio, cadastro, entrega, devolucao, troca, estoque };
const conteudo = document.getElementById('conteudo');
const menu = document.getElementById('menu');
const botaoMenu = document.querySelector('.menu-botao');

async function abrir() {
  const [caminho, busca = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const nome = telas[caminho] ? caminho : 'inicio';
  const params = Object.fromEntries(new URLSearchParams(busca));

  menu.querySelectorAll('a[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === nome));
  menu.classList.remove('aberto');
  botaoMenu.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.painel, .painel-fundo').forEach((el) => el.remove());

  conteudo.innerHTML = '<p class="carregando">Carregando…</p>';
  try {
    await telas[nome].renderizar(conteudo, params);
    document.title = `${conteudo.querySelector('h1')?.textContent ?? 'Início'} · Controle de Equipamentos`;
  } catch (erro) {
    conteudo.innerHTML = `<div class="cartao"><h2>Não foi possível carregar a tela</h2><p class="suave mt">${erro.message}</p></div>`;
    mostrarErro(erro);
  }
  conteudo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

botaoMenu.addEventListener('click', () => {
  const aberto = menu.classList.toggle('aberto');
  botaoMenu.setAttribute('aria-expanded', String(aberto));
});

window.addEventListener('hashchange', abrir);
if (!location.hash) history.replaceState(null, '', '#/inicio');
abrir();
