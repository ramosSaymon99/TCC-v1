// Funções de apoio às telas: formatação, avisos, formulários e seletor de equipamento.
import { api } from './api.js';

export const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
export const pct = (n, casas = 0) => `${(Number(n || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
export const dias = (n) => (n === 1 ? '1 dia' : `${numero(n)} dias`);

// Usuário conectado (preenchido pelo app.js ao abrir a aplicação).
export const sessao = { usuario: null };

// Listas de opções (situações, motivos, responsáveis…) carregadas uma vez e atualizadas após cada gravação.
let opcoesCache = null;
export async function opcoes(recarregar = false) {
  if (!opcoesCache || recarregar) opcoesCache = await api.opcoes();
  return opcoesCache;
}

export const selo = (situacao, rotulos) => `<span class="selo s-${esc(situacao)}">${esc(rotulos?.[situacao] ?? situacao)}</span>`;

export function aviso(mensagem, tipo = '') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = mensagem;
  document.getElementById('avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3800);
}

export const lerFormulario = (form) => Object.fromEntries(new FormData(form).entries());

// Mostra o erro da API no formulário e em um aviso; números de série repetidos são listados.
export function mostrarErro(erro, form) {
  let mensagem = erro.message;
  const d = erro.detalhes;
  if (d?.ja_cadastrados?.length) mensagem += ` Já cadastrados: ${d.ja_cadastrados.join(', ')}.`;
  if (d?.repetidos_na_lista?.length) mensagem += ` Repetidos na lista: ${d.repetidos_na_lista.join(', ')}.`;
  const alvo = form?.querySelector('.erro-form');
  if (alvo) alvo.textContent = mensagem;
  aviso(mensagem, 'erro');
}

export async function enviar(form, acao) {
  const botao = form.querySelector('button[type="submit"]');
  const alvo = form.querySelector('.erro-form');
  if (alvo) alvo.textContent = '';
  if (!form.reportValidity()) return null;
  botao.disabled = true;
  try {
    return await acao();
  } catch (erro) {
    mostrarErro(erro, form);
    return null;
  } finally {
    botao.disabled = false;
  }
}

export function datalist(id, valores) {
  return `<datalist id="${id}">${valores.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}

// Campos que toda movimentação registra: data, quem realizou e observação.
export function camposComuns(op, { rotuloObs = 'Observação', obsObrigatoria = false, minData = '' } = {}) {
  return `
    <div class="campo">
      <label class="obrigatorio" for="data">Data</label>
      <input id="data" name="data" type="date" required max="${hoje()}" ${minData ? `min="${minData}"` : ''} value="${hoje()}">
    </div>
    <div class="campo">
      <label class="obrigatorio" for="responsavel">Responsável</label>
      <input id="responsavel" name="responsavel" required maxlength="80" list="lista-responsaveis" autocomplete="off"
        placeholder="Quem realizou" value="${esc(sessao.usuario?.nome || '')}">
      <span class="dica">Quem fez a movimentação. O lançamento fica registrado em nome de ${esc(sessao.usuario?.nome || 'você')}.</span>
      ${datalist('lista-responsaveis', op.responsaveis)}
    </div>
    <div class="campo inteiro">
      <label for="observacao" class="${obsObrigatoria ? 'obrigatorio' : ''}">${esc(rotuloObs)}</label>
      <textarea id="observacao" name="observacao" maxlength="500" rows="2" ${obsObrigatoria ? 'required' : ''}></textarea>
    </div>`;
}

export const descricao = (e) => `${e.tipo} · ${e.marca} ${e.modelo}`;

/*
 * Seletor de equipamento: campo com sugestões (datalist) que aceita digitação ou leitor de código de barras.
 * Só aceita aparelhos da lista informada; o id escolhido vai em um campo oculto.
 */
export function seletorEquipamento({ nome, rotulo, dica, lista, rotulos, aoSelecionar }) {
  const idCampo = `sel-${nome}`;
  const html = `
    <div class="campo inteiro">
      <label class="obrigatorio" for="${idCampo}">${esc(rotulo)}</label>
      <input id="${idCampo}" class="mono" required autocomplete="off" list="${idCampo}-lista"
        placeholder="Digite ou bipe o número de série" spellcheck="false">
      <datalist id="${idCampo}-lista">${lista
        .map((e) => `<option value="${esc(e.numero_serie)}">${esc(descricao(e))}${e.cliente_codigo ? ` · cliente ${esc(e.cliente_codigo)}` : ''}</option>`)
        .join('')}</datalist>
      <input type="hidden" name="${nome}">
      ${dica ? `<span class="dica">${esc(dica)}</span>` : ''}
      <div class="previa vazia" data-previa>Nenhum equipamento selecionado.</div>
    </div>`;

  const ligar = (raiz) => {
    const campo = raiz.querySelector(`#${idCampo}`);
    const oculto = raiz.querySelector(`input[name="${nome}"]`);
    const previa = campo.parentElement.querySelector('[data-previa]');
    const atualizar = () => {
      const valor = campo.value.trim().toUpperCase();
      const achado = lista.find((e) => e.numero_serie.toUpperCase() === valor);
      oculto.value = achado ? achado.id : '';
      if (achado) {
        campo.setCustomValidity('');
        previa.className = 'previa';
        previa.innerHTML = `<span><strong class="mono">${esc(achado.numero_serie)}</strong> · ${esc(descricao(achado))}
          ${achado.cliente_codigo ? `<br><span class="suave">Cliente ${esc(achado.cliente_codigo)} · desde ${dataBR(achado.situacao_desde)}</span>` : ''}</span>
          ${selo(achado.situacao, rotulos)}`;
      } else if (valor) {
        campo.setCustomValidity('Equipamento não encontrado nesta lista.');
        previa.className = 'previa erro';
        previa.textContent = 'Número de série não encontrado entre os equipamentos permitidos para esta operação.';
      } else {
        campo.setCustomValidity('Selecione um equipamento.');
        previa.className = 'previa vazia';
        previa.textContent = 'Nenhum equipamento selecionado.';
      }
      aoSelecionar?.(achado || null);
    };
    campo.addEventListener('input', atualizar);
    campo.addEventListener('change', atualizar);
    atualizar();
    return {
      selecionar(numeroSerie) {
        campo.value = numeroSerie;
        atualizar();
      },
    };
  };
  return { html, ligar };
}

export function exportarCsv(nomeArquivo, colunas, linhas) {
  const celula = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const conteudo = [colunas.map((c) => celula(c.titulo)), ...linhas.map((l) => colunas.map((c) => celula(c.valor(l))))]
    .map((l) => l.join(';'))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
  a.click();
  URL.revokeObjectURL(url);
}
