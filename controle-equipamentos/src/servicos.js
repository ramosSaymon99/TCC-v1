// Regras de negócio: cada movimentação muda a situação do equipamento e fica registrada no histórico.
import { db, transacao } from './db.js';

export const SITUACOES = {
  disponivel: 'Disponível',
  com_cliente: 'Com cliente',
  aguardando_avaliacao: 'Aguardando avaliação',
  em_manutencao: 'Em manutenção',
  baixado: 'Baixado',
};

export const MOTIVOS = {
  cancelamento: 'Cancelamento',
  troca: 'Troca',
  defeito_relatado: 'Defeito relatado',
  queima_relatada: 'Queima relatada',
};

export const CONDICOES = {
  bom_estado: 'Aparentemente em bom estado',
  avarias: 'Com avarias físicas',
  sem_acessorios: 'Sem fonte ou acessórios',
  nao_liga: 'Não liga',
  nao_verificada: 'Não verificada na recepção',
};

// Resultado possível de uma avaliação técnica feita após a devolução.
export const RESULTADOS_AVALIACAO = ['disponivel', 'em_manutencao', 'baixado'];

export class ErroNegocio extends Error {
  constructor(mensagem, status = 400, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function texto(valor, campo, { obrigatorio = true, max = 120 } = {}) {
  const v = typeof valor === 'string' ? valor.trim() : valor == null ? '' : String(valor).trim();
  if (obrigatorio && !v) throw new ErroNegocio(`Informe o campo "${campo}".`);
  if (v.length > max) throw new ErroNegocio(`O campo "${campo}" aceita até ${max} caracteres.`);
  return v || null;
}

function opcao(valor, lista, campo) {
  if (!lista.includes(valor)) throw new ErroNegocio(`Selecione uma opção válida para "${campo}".`);
  return valor;
}

// A data não pode estar no futuro nem ser anterior à última movimentação do aparelho.
function dataMovimentacao(valor, equipamento) {
  const data = valor || hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) {
    throw new ErroNegocio('Data inválida.');
  }
  if (data > hoje()) throw new ErroNegocio('A data não pode estar no futuro.');
  if (equipamento && data < equipamento.situacao_desde) {
    throw new ErroNegocio(
      `A data não pode ser anterior à última movimentação do equipamento ${equipamento.numero_serie} (${formatarData(equipamento.situacao_desde)}).`
    );
  }
  return data;
}

function formatarData(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function buscarEquipamento(id) {
  const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(Number(id));
  if (!equipamento) throw new ErroNegocio('Equipamento não encontrado.', 404);
  return equipamento;
}

function exigirSituacao(equipamento, permitidas, acao) {
  if (!permitidas.includes(equipamento.situacao)) {
    throw new ErroNegocio(
      `Não é possível ${acao}: o equipamento ${equipamento.numero_serie} está "${SITUACOES[equipamento.situacao]}".`,
      409
    );
  }
}

const inserirMovimentacao = (m) =>
  db
    .prepare(
      `INSERT INTO movimentacoes
        (equipamento_id, tipo, cliente_codigo, data, responsavel, motivo, condicao, situacao_anterior, situacao_nova, troca_id, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      m.equipamento_id, m.tipo, m.cliente_codigo ?? null, m.data, m.responsavel, m.motivo ?? null,
      m.condicao ?? null, m.situacao_anterior ?? null, m.situacao_nova, m.troca_id ?? null, m.observacao ?? null
    );

const mudarSituacao = (id, situacao, cliente, data) =>
  db
    .prepare('UPDATE equipamentos SET situacao = ?, cliente_codigo = ?, situacao_desde = ? WHERE id = ?')
    .run(situacao, cliente, data, id);

/* ---------- Cadastro ---------- */

export function cadastrar(dados) {
  const tipo = texto(dados.tipo, 'Tipo', { max: 40 });
  const marca = texto(dados.marca, 'Marca', { max: 60 });
  const modelo = texto(dados.modelo, 'Modelo', { max: 60 });
  const responsavel = texto(dados.responsavel, 'Responsável', { max: 80 });
  const observacao = texto(dados.observacao, 'Observação', { obrigatorio: false, max: 500 });
  const data = dataMovimentacao(dados.data);

  const lista = (Array.isArray(dados.numeros_serie) ? dados.numeros_serie : [dados.numeros_serie])
    .map((s) => (s == null ? '' : String(s).trim().toUpperCase()))
    .filter(Boolean);
  if (!lista.length) throw new ErroNegocio('Informe ao menos um número de série.');
  if (lista.length > 500) throw new ErroNegocio('Cadastre no máximo 500 equipamentos por vez.');
  const invalido = lista.find((s) => s.length > 60 || /\s/.test(s));
  if (invalido) throw new ErroNegocio(`Número de série inválido: "${invalido}" (sem espaços, até 60 caracteres).`);

  const repetidosNaLista = [...new Set(lista.filter((s, i) => lista.indexOf(s) !== i))];
  const consulta = db.prepare('SELECT numero_serie FROM equipamentos WHERE numero_serie = ?');
  const jaCadastrados = lista.filter((s) => consulta.get(s));
  if (repetidosNaLista.length || jaCadastrados.length) {
    throw new ErroNegocio('Há números de série repetidos. Nenhum equipamento foi cadastrado.', 409, {
      repetidos_na_lista: repetidosNaLista,
      ja_cadastrados: [...new Set(jaCadastrados)],
    });
  }

  return transacao(() => {
    const inserir = db.prepare(
      `INSERT INTO equipamentos (tipo, marca, modelo, numero_serie, situacao, situacao_desde, observacao)
       VALUES (?, ?, ?, ?, 'disponivel', ?, ?)`
    );
    return lista.map((numero) => {
      const { lastInsertRowid } = inserir.run(tipo, marca, modelo, numero, data, observacao);
      const id = Number(lastInsertRowid);
      inserirMovimentacao({ equipamento_id: id, tipo: 'cadastro', data, responsavel, situacao_nova: 'disponivel', observacao });
      return id;
    });
  });
}

export function atualizar(id, dados) {
  const equipamento = buscarEquipamento(id);
  const tipo = texto(dados.tipo, 'Tipo', { max: 40 });
  const marca = texto(dados.marca, 'Marca', { max: 60 });
  const modelo = texto(dados.modelo, 'Modelo', { max: 60 });
  const numero = texto(dados.numero_serie, 'Número de série', { max: 60 }).toUpperCase();
  if (/\s/.test(numero)) throw new ErroNegocio('O número de série não pode ter espaços.');
  const observacao = texto(dados.observacao, 'Observação', { obrigatorio: false, max: 500 });

  const outro = db.prepare('SELECT id FROM equipamentos WHERE numero_serie = ? AND id <> ?').get(numero, equipamento.id);
  if (outro) throw new ErroNegocio(`O número de série ${numero} já pertence a outro equipamento.`, 409);

  db.prepare('UPDATE equipamentos SET tipo = ?, marca = ?, modelo = ?, numero_serie = ?, observacao = ? WHERE id = ?').run(
    tipo, marca, modelo, numero, observacao, equipamento.id
  );
  return obter(equipamento.id);
}

/* ---------- Movimentações ---------- */

export function entregar(dados) {
  const equipamento = buscarEquipamento(dados.equipamento_id);
  exigirSituacao(equipamento, ['disponivel'], 'entregar');
  const cliente = texto(dados.cliente_codigo, 'Código do cliente', { max: 30 });
  const responsavel = texto(dados.responsavel, 'Responsável', { max: 80 });
  const observacao = texto(dados.observacao, 'Observação', { obrigatorio: false, max: 500 });
  const data = dataMovimentacao(dados.data, equipamento);

  transacao(() => {
    mudarSituacao(equipamento.id, 'com_cliente', cliente, data);
    inserirMovimentacao({
      equipamento_id: equipamento.id, tipo: 'entrega', cliente_codigo: cliente, data, responsavel,
      situacao_anterior: equipamento.situacao, situacao_nova: 'com_cliente', observacao,
    });
  });
  return obter(equipamento.id);
}

// A devolução nunca torna o aparelho disponível: ele aguarda avaliação técnica.
function registrarDevolucao(equipamento, { motivo, condicao, data, responsavel, observacao, troca_id }) {
  mudarSituacao(equipamento.id, 'aguardando_avaliacao', null, data);
  inserirMovimentacao({
    equipamento_id: equipamento.id, tipo: 'devolucao', cliente_codigo: equipamento.cliente_codigo, data, responsavel,
    motivo, condicao, situacao_anterior: equipamento.situacao, situacao_nova: 'aguardando_avaliacao', troca_id, observacao,
  });
}

export function devolver(dados) {
  const equipamento = buscarEquipamento(dados.equipamento_id);
  exigirSituacao(equipamento, ['com_cliente'], 'registrar a devolução');
  const motivo = opcao(dados.motivo, Object.keys(MOTIVOS), 'Motivo da devolução');
  const condicao = opcao(dados.condicao, Object.keys(CONDICOES), 'Condição informada');
  const responsavel = texto(dados.responsavel, 'Responsável', { max: 80 });
  const observacao = texto(dados.observacao, 'Observação', { obrigatorio: false, max: 500 });
  const data = dataMovimentacao(dados.data, equipamento);

  transacao(() => registrarDevolucao(equipamento, { motivo, condicao, data, responsavel, observacao }));
  return obter(equipamento.id);
}

export function trocar(dados) {
  const devolvido = buscarEquipamento(dados.equipamento_devolvido_id);
  const novo = buscarEquipamento(dados.equipamento_entregue_id);
  if (devolvido.id === novo.id) throw new ErroNegocio('Selecione equipamentos diferentes para a troca.');
  exigirSituacao(devolvido, ['com_cliente'], 'receber na troca');
  exigirSituacao(novo, ['disponivel'], 'entregar na troca');
  const motivo = opcao(dados.motivo, ['troca', 'defeito_relatado', 'queima_relatada'], 'Motivo da troca');
  const condicao = opcao(dados.condicao, Object.keys(CONDICOES), 'Condição informada');
  const responsavel = texto(dados.responsavel, 'Responsável', { max: 80 });
  const observacao = texto(dados.observacao, 'Observação', { obrigatorio: false, max: 500 });
  const data = dataMovimentacao(dados.data, devolvido);
  dataMovimentacao(data, novo);
  const cliente = devolvido.cliente_codigo;

  const trocaId = transacao(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO trocas (cliente_codigo, equipamento_devolvido_id, equipamento_entregue_id, data, responsavel, motivo, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(cliente, devolvido.id, novo.id, data, responsavel, motivo, observacao);
    const troca_id = Number(lastInsertRowid);
    registrarDevolucao(devolvido, { motivo, condicao, data, responsavel, observacao, troca_id });
    mudarSituacao(novo.id, 'com_cliente', cliente, data);
    inserirMovimentacao({
      equipamento_id: novo.id, tipo: 'entrega', cliente_codigo: cliente, data, responsavel,
      situacao_anterior: novo.situacao, situacao_nova: 'com_cliente', troca_id, observacao,
    });
    return troca_id;
  });
  return { troca_id: trocaId, devolvido: obter(devolvido.id), entregue: obter(novo.id) };
}

export function avaliar(dados) {
  const equipamento = buscarEquipamento(dados.equipamento_id);
  exigirSituacao(equipamento, ['aguardando_avaliacao', 'em_manutencao'], 'avaliar');
  const resultado = opcao(dados.resultado, RESULTADOS_AVALIACAO, 'Resultado da avaliação');
  if (resultado === equipamento.situacao) throw new ErroNegocio('O equipamento já está nessa situação.');
  const responsavel = texto(dados.responsavel, 'Responsável', { max: 80 });
  const observacao = texto(dados.observacao, resultado === 'baixado' ? 'Motivo da baixa' : 'Laudo / observação', {
    obrigatorio: resultado === 'baixado',
    max: 500,
  });
  const data = dataMovimentacao(dados.data, equipamento);

  transacao(() => {
    mudarSituacao(equipamento.id, resultado, null, data);
    inserirMovimentacao({
      equipamento_id: equipamento.id, tipo: 'avaliacao', data, responsavel,
      situacao_anterior: equipamento.situacao, situacao_nova: resultado, observacao,
    });
  });
  return obter(equipamento.id);
}

/* ---------- Consultas ---------- */

const DIAS = `CAST(julianday(date('now','localtime')) - julianday(situacao_desde) AS INTEGER)`;

export function listar({ busca = '', situacao = '', tipo = '' } = {}) {
  const filtros = [];
  const valores = [];
  if (busca.trim()) {
    const termo = `%${busca.trim()}%`;
    filtros.push('(numero_serie LIKE ? OR modelo LIKE ? OR marca LIKE ? OR cliente_codigo LIKE ?)');
    valores.push(termo, termo, termo, termo);
  }
  if (situacao) {
    filtros.push('situacao = ?');
    valores.push(situacao);
  }
  if (tipo) {
    filtros.push('tipo = ?');
    valores.push(tipo);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  return db
    .prepare(`SELECT *, ${DIAS} AS dias_na_situacao FROM equipamentos ${where} ORDER BY situacao_desde DESC, id DESC`)
    .all(...valores);
}

export function obter(id) {
  const equipamento = db
    .prepare(`SELECT *, ${DIAS} AS dias_na_situacao FROM equipamentos WHERE id = ?`)
    .get(Number(id));
  if (!equipamento) throw new ErroNegocio('Equipamento não encontrado.', 404);
  // Em uma troca, mostra também o outro aparelho envolvido.
  equipamento.historico = db
    .prepare(
      `SELECT m.*,
              CASE WHEN t.equipamento_devolvido_id = m.equipamento_id THEN en.numero_serie ELSE dv.numero_serie END AS troca_outro_serie,
              CASE WHEN t.equipamento_devolvido_id = m.equipamento_id THEN en.id ELSE dv.id END AS troca_outro_id
         FROM movimentacoes m
         LEFT JOIN trocas t ON t.id = m.troca_id
         LEFT JOIN equipamentos en ON en.id = t.equipamento_entregue_id
         LEFT JOIN equipamentos dv ON dv.id = t.equipamento_devolvido_id
        WHERE m.equipamento_id = ?
        ORDER BY m.data DESC, m.id DESC`
    )
    .all(equipamento.id);
  return equipamento;
}

export function porCliente(codigo) {
  const cliente = String(codigo || '').trim();
  return {
    cliente_codigo: cliente,
    equipamentos: db
      .prepare(`SELECT *, ${DIAS} AS dias_na_situacao FROM equipamentos WHERE cliente_codigo = ? COLLATE NOCASE`)
      .all(cliente),
    historico: db
      .prepare(
        `SELECT m.*, e.numero_serie, e.tipo, e.modelo FROM movimentacoes m
           JOIN equipamentos e ON e.id = m.equipamento_id
          WHERE m.cliente_codigo = ? COLLATE NOCASE ORDER BY m.data DESC, m.id DESC`
      )
      .all(cliente),
  };
}

export function movimentacoes({ limite = 50, tipo = '' } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 500);
  const where = tipo ? 'WHERE m.tipo = ?' : '';
  return db
    .prepare(
      `SELECT m.*, e.numero_serie, e.tipo AS equipamento_tipo, e.marca, e.modelo
         FROM movimentacoes m JOIN equipamentos e ON e.id = m.equipamento_id
         ${where} ORDER BY m.data DESC, m.id DESC LIMIT ${lim}`
    )
    .all(...(tipo ? [tipo] : []));
}

export function opcoes() {
  const distintos = (coluna, tabela = 'equipamentos') =>
    db.prepare(`SELECT DISTINCT ${coluna} AS v FROM ${tabela} WHERE ${coluna} IS NOT NULL ORDER BY 1`).all().map((r) => r.v);
  return {
    situacoes: SITUACOES,
    motivos: MOTIVOS,
    condicoes: CONDICOES,
    tipos: distintos('tipo'),
    marcas: distintos('marca'),
    modelos: distintos('modelo'),
    responsaveis: distintos('responsavel', 'movimentacoes'),
  };
}

export function resumo() {
  const porSituacao = Object.fromEntries(Object.keys(SITUACOES).map((s) => [s, 0]));
  for (const r of db.prepare('SELECT situacao, COUNT(*) AS n FROM equipamentos GROUP BY situacao').all()) {
    porSituacao[r.situacao] = r.n;
  }

  // Cobertura do estoque: quantos dias o saldo disponível dura no ritmo de saída dos últimos 30 dias.
  const porTipo = db
    .prepare(
      `SELECT e.tipo,
              SUM(e.situacao = 'disponivel') AS disponivel,
              SUM(e.situacao = 'com_cliente') AS com_cliente,
              SUM(e.situacao IN ('aguardando_avaliacao','em_manutencao')) AS em_analise,
              SUM(e.situacao = 'baixado') AS baixado,
              COUNT(*) AS total,
              (SELECT COUNT(*) FROM movimentacoes m JOIN equipamentos x ON x.id = m.equipamento_id
                WHERE x.tipo = e.tipo AND m.tipo = 'entrega' AND m.data >= date('now','localtime','-30 days')) AS saidas_30d
         FROM equipamentos e GROUP BY e.tipo ORDER BY total DESC`
    )
    .all()
    .map((r) => ({ ...r, cobertura_dias: r.saidas_30d ? Math.round(r.disponivel / (r.saidas_30d / 30)) : null }));

  const aguardando = db
    .prepare(
      `SELECT id, tipo, marca, modelo, numero_serie, situacao, situacao_desde, ${DIAS} AS dias_na_situacao
         FROM equipamentos WHERE situacao IN ('aguardando_avaliacao','em_manutencao')
        ORDER BY situacao_desde ASC`
    )
    .all();

  const devolucoes90 = db
    .prepare(
      `SELECT motivo, COUNT(*) AS n FROM movimentacoes
        WHERE tipo = 'devolucao' AND data >= date('now','localtime','-90 days') GROUP BY motivo ORDER BY n DESC`
    )
    .all();

  // Taxa de falha por modelo: devoluções por defeito/queima sobre o total de entregas do modelo.
  const modelos = db
    .prepare(
      `SELECT e.tipo, e.marca, e.modelo,
              COUNT(DISTINCT e.id) AS aparelhos,
              SUM(m.tipo = 'entrega') AS entregas,
              SUM(m.tipo = 'devolucao' AND m.motivo IN ('defeito_relatado','queima_relatada')) AS falhas,
              SUM(m.tipo = 'devolucao' AND m.motivo = 'queima_relatada') AS queimas
         FROM equipamentos e LEFT JOIN movimentacoes m ON m.equipamento_id = e.id
        GROUP BY e.tipo, e.marca, e.modelo`
    )
    .all()
    .map((r) => ({ ...r, taxa_falha: r.entregas ? r.falhas / r.entregas : 0 }))
    .sort((a, b) => b.taxa_falha - a.taxa_falha || b.entregas - a.entregas);

  const mensal = db
    .prepare(
      `SELECT strftime('%Y-%m', data) AS mes,
              SUM(tipo = 'entrega') AS entregas,
              SUM(tipo = 'devolucao') AS devolucoes,
              SUM(tipo = 'devolucao' AND motivo IN ('defeito_relatado','queima_relatada')) AS falhas
         FROM movimentacoes
        WHERE data >= date('now','localtime','start of month','-5 months')
        GROUP BY mes ORDER BY mes`
    )
    .all();

  return {
    total: Object.values(porSituacao).reduce((a, b) => a + b, 0),
    por_situacao: porSituacao,
    por_tipo: porTipo,
    em_analise: aguardando,
    devolucoes_90d: devolucoes90,
    modelos,
    mensal,
    ultimas: movimentacoes({ limite: 8 }),
  };
}
