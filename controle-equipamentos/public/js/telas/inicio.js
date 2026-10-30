// Tela Início: resumo por situação, alertas e indicadores que apontam onde agir.
import { api } from '../api.js';
import { esc, numero, pct, dias, dataBR, selo, opcoes } from '../ui.js';

const CORES = {
  disponivel: 'var(--sucesso)',
  com_cliente: 'var(--primaria)',
  aguardando_avaliacao: 'var(--alerta)',
  em_manutencao: 'var(--info)',
  baixado: 'var(--perigo)',
};
const COBERTURA_MINIMA = 15; // dias
const LIMITE_FILA = 7; // dias aguardando avaliação
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export async function renderizar(raiz) {
  const [r, op] = await Promise.all([api.resumo(), opcoes(true)]);
  const S = op.situacoes;

  if (!r.total) {
    raiz.innerHTML = `
      <div class="cabecalho"><div><h1>Início</h1><p>Nenhum equipamento cadastrado ainda.</p></div></div>
      <div class="cartao"><h2>Comece pelo cadastro</h2>
        <p class="suave mt">Registre os aparelhos recebidos (tipo, marca, modelo e número de série). Depois disso, as entregas,
        devoluções e trocas passam a alimentar este painel.</p>
        <p class="mt"><a class="botao" href="#/cadastro">Cadastrar equipamentos</a></p></div>`;
    return;
  }

  const ativos = r.total - r.por_situacao.baixado;
  const kpi = (s, apoio) => `
    <a class="kpi" href="#/estoque?situacao=${s}" style="--cor:${CORES[s]}">
      <div class="rotulo">${esc(S[s])}</div>
      <div class="valor num">${numero(r.por_situacao[s])}</div>
      <div class="apoio">${apoio}</div>
    </a>`;

  raiz.innerHTML = `
    <div class="cabecalho">
      <div><h1>Início</h1><p>Situação atual dos ${numero(r.total)} equipamentos cadastrados e os pontos que pedem ação.</p></div>
      <div class="acoes">
        <a class="botao" href="#/entrega">↗ Nova entrega</a>
        <a class="botao secundario" href="#/devolucao">↙ Devolução</a>
        <a class="botao secundario" href="#/troca">⇄ Troca</a>
      </div>
    </div>

    <section class="kpis" aria-label="Equipamentos por situação">
      ${kpi('disponivel', `${pct(r.por_situacao.disponivel / (ativos || 1))} do parque ativo`)}
      ${kpi('com_cliente', `${pct(r.por_situacao.com_cliente / (ativos || 1))} do parque ativo`)}
      ${kpi('aguardando_avaliacao', `${numero(r.em_analise.filter((e) => e.situacao === 'aguardando_avaliacao' && e.dias_na_situacao > LIMITE_FILA).length)} há mais de ${LIMITE_FILA} dias`)}
      ${kpi('em_manutencao', 'Fora do estoque até o reparo')}
      ${kpi('baixado', 'Descartados após avaliação')}
    </section>

    <section class="cartao" aria-labelledby="t-agir">
      <header><h2 id="t-agir">Onde agir agora</h2><p>Gerado automaticamente a partir das movimentações</p></header>
      <div class="insights">${insights(r).join('')}</div>
    </section>

    <div class="grade grade-2 mt">
      <section class="cartao" aria-labelledby="t-tipo">
        <header><h2 id="t-tipo">Estoque por tipo</h2><p>Cobertura = disponíveis ÷ ritmo de saída dos últimos 30 dias</p></header>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Tipo</th><th class="d">Disponível</th><th class="d">Com cliente</th><th class="d">Em análise</th><th class="d">Saídas 30d</th><th class="d">Cobertura</th></tr></thead>
          <tbody>${r.por_tipo.map(linhaTipo).join('')}</tbody>
        </table></div>
      </section>

      <section class="cartao" aria-labelledby="t-mensal">
        <header><h2 id="t-mensal">Entregas × devoluções</h2>
          <div class="legenda"><span><i class="b-entrega"></i>Entregas</span><span><i class="b-devolucao"></i>Devoluções</span></div>
        </header>
        ${grafico(r.mensal)}
      </section>

      <section class="cartao" aria-labelledby="t-modelos">
        <header><h2 id="t-modelos">Falhas por modelo</h2><p>Devoluções por defeito ou queima ÷ entregas</p></header>
        ${r.modelos.filter((m) => m.entregas).map(barraModelo(r)).join('') || '<p class="vazio">Sem entregas registradas.</p>'}
      </section>

      <section class="cartao" aria-labelledby="t-fila">
        <header><h2 id="t-fila">Fila de avaliação</h2><a href="#/estoque?situacao=aguardando_avaliacao">Ver todos</a></header>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Nº de série</th><th>Modelo</th><th>Situação</th><th class="d">Parado há</th></tr></thead>
          <tbody>${
            r.em_analise
              .slice(0, 6)
              .map(
                (e) => `<tr class="clicavel" data-id="${e.id}">
                  <td class="mono">${esc(e.numero_serie)}</td><td>${esc(e.modelo)}</td><td>${selo(e.situacao, S)}</td>
                  <td class="d num" style="${e.dias_na_situacao > LIMITE_FILA ? 'color:var(--perigo);font-weight:600' : ''}">${dias(e.dias_na_situacao)}</td></tr>`
              )
              .join('') || '<tr><td colspan="4" class="vazio">Nenhum aparelho aguardando avaliação.</td></tr>'
          }</tbody>
        </table></div>
      </section>
    </div>

    <section class="cartao mt" aria-labelledby="t-ultimas">
      <header><h2 id="t-ultimas">Últimas movimentações</h2><a href="#/estoque">Estoque e histórico</a></header>
      <div class="tabela-rolagem"><table>
        <thead><tr><th>Data</th><th>Movimentação</th><th>Nº de série</th><th>Equipamento</th><th>Cliente</th><th>Responsável</th></tr></thead>
        <tbody>${r.ultimas
          .map(
            (m) => `<tr class="clicavel" data-id="${m.equipamento_id}">
              <td class="num">${dataBR(m.data)}</td><td>${rotuloMov(m, op)}</td><td class="mono">${esc(m.numero_serie)}</td>
              <td>${esc(m.equipamento_tipo)} · ${esc(m.modelo)}</td><td>${esc(m.cliente_codigo || '—')}</td><td>${esc(m.responsavel)}</td></tr>`
          )
          .join('')}</tbody>
      </table></div>
    </section>`;

  raiz.querySelectorAll('tr[data-id]').forEach((tr) =>
    tr.addEventListener('click', () => (location.hash = `#/estoque?id=${tr.dataset.id}`))
  );
}

export function rotuloMov(m, op) {
  const base = { cadastro: 'Cadastro', entrega: 'Entrega', devolucao: 'Devolução', avaliacao: 'Avaliação' }[m.tipo];
  if (m.tipo === 'devolucao' && m.motivo === 'troca') return `${base} (troca)`;
  if (m.tipo === 'devolucao') return `${base} · ${esc(op.motivos[m.motivo] ?? '')}${m.troca_id ? ' (troca)' : ''}`;
  if (m.tipo === 'avaliacao') return `${base} → ${esc(op.situacoes[m.situacao_nova])}`;
  if (m.tipo === 'entrega' && m.troca_id) return `${base} (troca)`;
  return base;
}

function linhaTipo(t) {
  const cor = t.cobertura_dias === null ? '' : t.cobertura_dias < COBERTURA_MINIMA ? 'var(--perigo)' : 'var(--sucesso)';
  return `<tr>
    <td><a href="#/estoque?tipo=${encodeURIComponent(t.tipo)}&situacao=disponivel">${esc(t.tipo)}</a></td>
    <td class="d num"><strong>${numero(t.disponivel)}</strong></td>
    <td class="d num">${numero(t.com_cliente)}</td>
    <td class="d num">${numero(t.em_analise)}</td>
    <td class="d num">${numero(t.saidas_30d)}</td>
    <td class="d num" style="color:${cor};font-weight:600">${t.cobertura_dias === null ? '—' : dias(t.cobertura_dias)}</td>
  </tr>`;
}

function grafico(mensal) {
  if (!mensal.length) return '<p class="vazio">Sem movimentações nos últimos meses.</p>';
  const maximo = Math.max(...mensal.flatMap((m) => [m.entregas, m.devolucoes]), 1);
  const altura = (v) => `${Math.round((v / maximo) * 85)}%`;
  return `<div class="colunas" role="img" aria-label="Entregas e devoluções por mês">${mensal
    .map((m) => {
      const [ano, mes] = m.mes.split('-');
      return `<div class="coluna" title="${MESES[mes - 1]}/${ano}: ${m.entregas} entregas, ${m.devolucoes} devoluções (${m.falhas} por defeito/queima)">
        <div class="par">
          <div class="b b-entrega" style="height:${altura(m.entregas)}"><span>${m.entregas}</span></div>
          <div class="b b-devolucao" style="height:${altura(m.devolucoes)}"><span>${m.devolucoes}</span></div>
        </div>
        <div class="mes">${MESES[mes - 1]}</div>
      </div>`;
    })
    .join('')}</div>`;
}

const mediaFalha = (r) => {
  const entregas = r.modelos.reduce((a, m) => a + m.entregas, 0);
  return entregas ? r.modelos.reduce((a, m) => a + m.falhas, 0) / entregas : 0;
};

const barraModelo = (r) => {
  const media = mediaFalha(r);
  const maximo = Math.max(...r.modelos.map((m) => m.taxa_falha), 0.01);
  return (m) => {
    const cor = m.entregas >= 10 && m.taxa_falha >= Math.max(media * 1.5, 0.08) ? 'var(--perigo)' : 'var(--primaria)';
    return `<div class="barra-linha" title="${m.falhas} falhas (${m.queimas} queimas) em ${m.entregas} entregas">
      <span>${esc(m.marca)} ${esc(m.modelo)} <span class="fraco">· ${esc(m.tipo)}</span></span>
      <div class="barra-fundo"><div class="barra" style="width:${(m.taxa_falha / maximo) * 100}%;--cor:${cor}"></div></div>
      <span class="d num"><strong>${pct(m.taxa_falha, 1)}</strong> <span class="fraco">(${m.falhas}/${m.entregas})</span></span>
    </div>`;
  };
};

// Regras que transformam os números em alertas com uma ação sugerida.
function insights(r) {
  const itens = [];
  const card = (nivel, titulo, acao, link, rotulo) =>
    `<div class="insight ${nivel}"><div><strong>${titulo}</strong><div class="acao">${acao}</div></div>
      ${link ? `<a class="botao secundario pequeno" href="${link}">${rotulo}</a>` : '<span></span>'}</div>`;

  for (const t of r.por_tipo) {
    if (!t.saidas_30d) continue;
    const necessidade = Math.max(t.saidas_30d - t.disponivel, 0);
    const emAnalise = t.em_analise ? ` Há ${numero(t.em_analise)} em análise que podem voltar ao estoque após avaliação.` : '';
    if (t.disponivel === 0) {
      itens.push(card('critico', `${esc(t.tipo)}: nenhum aparelho disponível`,
        `Saíram ${numero(t.saidas_30d)} nos últimos 30 dias; novas instalações e trocas desse tipo ficam travadas. Repor ao menos ${numero(necessidade)} unidades para 30 dias.${emAnalise}`,
        `#/estoque?tipo=${encodeURIComponent(t.tipo)}`, 'Ver tipo'));
    } else if (t.cobertura_dias < COBERTURA_MINIMA) {
      itens.push(card('atencao', `${esc(t.tipo)}: estoque para cerca de ${dias(t.cobertura_dias)}`,
        `${numero(t.disponivel)} disponíveis para um ritmo de ${numero(t.saidas_30d)} saídas/mês. Programar compra de ~${numero(necessidade)} unidades para cobrir 30 dias.${emAnalise}`,
        `#/estoque?tipo=${encodeURIComponent(t.tipo)}&situacao=disponivel`, 'Ver disponíveis'));
    } else if (t.cobertura_dias > 120) {
      itens.push(card('info', `${esc(t.tipo)}: estoque para ${dias(t.cobertura_dias)}`,
        `Acima de 4 meses de consumo. Avaliar adiar novas compras desse tipo e direcionar o orçamento para os itens com cobertura baixa.`,
        `#/estoque?tipo=${encodeURIComponent(t.tipo)}&situacao=disponivel`, 'Ver disponíveis'));
    }
  }

  const parados = r.em_analise.filter((e) => e.situacao === 'aguardando_avaliacao' && e.dias_na_situacao > LIMITE_FILA);
  if (parados.length) {
    const maisAntigo = Math.max(...parados.map((e) => e.dias_na_situacao));
    itens.push(card('atencao', `${numero(parados.length)} aparelho(s) aguardando avaliação há mais de ${LIMITE_FILA} dias`,
      `O mais antigo está parado há ${dias(maisAntigo)}. Reservar horário de bancada: aparelhos aprovados voltam como disponíveis e evitam compras.`,
      '#/estoque?situacao=aguardando_avaliacao', 'Avaliar'));
  }

  const media = mediaFalha(r);
  const alvo = r.modelos.filter((m) => m.entregas >= 10 && m.taxa_falha >= Math.max(media * 1.5, 0.08));
  for (const m of alvo) {
    const alternativa = r.modelos
      .filter((x) => x.tipo === m.tipo && x.entregas >= 10 && x.taxa_falha < m.taxa_falha)
      .sort((a, b) => a.taxa_falha - b.taxa_falha)[0];
    itens.push(card('critico', `${esc(m.marca)} ${esc(m.modelo)}: ${pct(m.taxa_falha, 1)} das entregas voltaram com defeito ou queima`,
      `Média geral: ${pct(media, 1)} (${numero(m.falhas)} falhas, ${numero(m.queimas)} por queima). Verificar lote/firmware e garantia com o fornecedor${
        alternativa ? `; priorizar ${esc(alternativa.marca)} ${esc(alternativa.modelo)} (${pct(alternativa.taxa_falha, 1)}) nas novas instalações` : ''}.`,
      `#/estoque?busca=${encodeURIComponent(m.modelo)}`, 'Ver aparelhos'));
  }

  const falhas90 = r.devolucoes_90d.filter((d) => d.motivo === 'defeito_relatado' || d.motivo === 'queima_relatada');
  const totalFalhas = falhas90.reduce((a, d) => a + d.n, 0);
  const queimas = r.devolucoes_90d.find((d) => d.motivo === 'queima_relatada')?.n || 0;
  if (totalFalhas >= 5 && queimas / totalFalhas >= 0.3) {
    itens.push(card('info', `Queimas são ${pct(queimas / totalFalhas)} das falhas dos últimos 90 dias`,
      `${numero(queimas)} aparelhos devolvidos por queima. Hipótese a validar: picos de energia em regiões específicas. Cruzar os códigos de clientes com bairro/rede e orientar uso de DPS/estabilizador.`,
      '#/estoque?situacao=baixado', 'Ver baixados'));
  }

  if (!itens.length) {
    itens.push(card('ok', 'Nenhum desvio relevante no momento', 'Estoque com cobertura adequada, fila de avaliação em dia e falhas dentro da média.'));
  }
  return itens;
}
