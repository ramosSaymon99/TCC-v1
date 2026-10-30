// Recria o banco com dados de demonstração (seis meses de movimentações simuladas).
// Uso: npm run seed
import { db } from '../src/db.js';
import * as s from '../src/servicos.js';
import { gerarHash } from '../src/auth.js';

db.exec(`DELETE FROM movimentacoes; DELETE FROM trocas; DELETE FROM equipamentos;
  DELETE FROM sessoes; DELETE FROM usuarios; DELETE FROM sqlite_sequence;`);

// Usuários de demonstração (senhas definitivas, sem troca obrigatória).
const usuariosDemo = [
  ['Juliana Lima', 'admin@provedor.local', 'admin123', 'administrador'],
  ['Carlos Souza', 'tecnico@provedor.local', 'tecnico123', 'operador'],
];
for (const [nome, email, senha, perfil] of usuariosDemo) {
  db.prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)').run(nome, email, gerarHash(senha), perfil);
}

// Gerador pseudoaleatório com semente fixa: a demonstração é sempre a mesma.
let semente = 42;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const sorteio = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const chance = (p) => aleatorio() < p;

const modelos = [
  { tipo: 'ONU', marca: 'Huawei', modelo: 'EG8145V5', prefixo: 'HWTC', falha: 0.03, peso: 4 },
  { tipo: 'ONU', marca: 'ZTE', modelo: 'F670L', prefixo: 'ZTEG', falha: 0.16, peso: 3 },
  { tipo: 'ONU', marca: 'Nokia', modelo: 'G-1425G-A', prefixo: 'ALCL', falha: 0.05, peso: 2 },
  { tipo: 'Roteador Wi-Fi', marca: 'TP-Link', modelo: 'Archer C6', prefixo: 'TPC6', falha: 0.06, peso: 3 },
  { tipo: 'Roteador Wi-Fi', marca: 'Intelbras', modelo: 'W5-1200F', prefixo: 'ITW5', falha: 0.1, peso: 2 },
  { tipo: 'Repetidor Mesh', marca: 'TP-Link', modelo: 'Deco M4', prefixo: 'DCM4', falha: 0.04, peso: 1 },
];
const tecnicos = ['Carlos Souza', 'Marcos Pereira', 'Rafael Gomes'];
const estoque = 'Juliana Lima';
const atendimento = 'Ana Ribeiro';
const condicoesBoas = ['bom_estado', 'bom_estado', 'bom_estado', 'sem_acessorios', 'nao_verificada'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inicio = new Date();
inicio.setHours(0, 0, 0, 0);
inicio.setDate(inicio.getDate() - 180);

let serial = 100000;
const recebimento = (m, qtd, data) =>
  s.cadastrar({
    ...m,
    numeros_serie: Array.from({ length: qtd }, () => `${m.prefixo}${(serial += 7).toString(16).toUpperCase()}`),
    data,
    responsavel: estoque,
    observacao: 'Lote recebido do fornecedor',
  });

const comSituacao = (situacao, tipo) =>
  db.prepare(`SELECT * FROM equipamentos WHERE situacao = ? ${tipo ? 'AND tipo = ?' : ''}`).all(...(tipo ? [situacao, tipo] : [situacao]));

const modeloDe = (e) => modelos.find((m) => m.modelo === e.modelo);
let cliente = 20410;

for (let d = new Date(inicio); d <= new Date(); d.setDate(d.getDate() + 1)) {
  const data = iso(d);
  const diaUtil = d.getDay() !== 0;

  // Compras: lote inicial e reposições periódicas (roteadores ficam propositalmente apertados).
  if (d.getTime() === inicio.getTime()) modelos.forEach((m) => recebimento(m, m.peso * 6, data));
  else if (d.getDate() === 5) modelos.forEach((m) => recebimento(m, m.peso * 5, data));

  if (!diaUtil) continue;

  // Novas instalações: uma ONU e, na maioria das vezes, um roteador para o mesmo cliente.
  for (let i = 0, n = 1 + Math.floor(aleatorio() * 2); i < n; i++) {
    const codigo = String((cliente += 1 + Math.floor(aleatorio() * 4)));
    const tecnico = sorteio(tecnicos);
    for (const tipo of ['ONU', 'Roteador Wi-Fi', 'Repetidor Mesh']) {
      if (tipo === 'Roteador Wi-Fi' && !chance(0.8)) continue;
      if (tipo === 'Repetidor Mesh' && !chance(0.15)) continue;
      const livres = comSituacao('disponivel', tipo);
      if (!livres.length) continue;
      const pesos = livres.flatMap((e) => Array(modeloDe(e).peso).fill(e));
      s.entregar({ equipamento_id: sorteio(pesos).id, cliente_codigo: codigo, data, responsavel: tecnico });
    }
  }

  // Ocorrências com aparelhos em clientes: cancelamento, defeito ou queima (resolvidos por troca).
  for (const e of comSituacao('com_cliente')) {
    if (e.situacao_desde === data) continue;
    const m = modeloDe(e);
    if (chance(m.falha / 60)) {
      const motivo = chance(0.35) ? 'queima_relatada' : 'defeito_relatado';
      const substituto = comSituacao('disponivel', e.tipo)[0];
      const comum = {
        motivo,
        condicao: motivo === 'queima_relatada' ? 'nao_liga' : sorteio(['bom_estado', 'avarias', 'nao_verificada']),
        data,
        responsavel: sorteio(tecnicos),
        observacao: motivo === 'queima_relatada' ? 'Cliente relata queda de energia na região' : 'Cliente relata quedas de conexão',
      };
      if (substituto) s.trocar({ ...comum, equipamento_devolvido_id: e.id, equipamento_entregue_id: substituto.id });
      else s.devolver({ ...comum, equipamento_id: e.id });
    } else if (chance(0.0018)) {
      s.devolver({ equipamento_id: e.id, motivo: 'cancelamento', condicao: sorteio(condicoesBoas), data, responsavel: atendimento });
    } else if (e.tipo === 'Roteador Wi-Fi' && chance(0.0004)) {
      const novo = comSituacao('disponivel', 'Repetidor Mesh')[0] || comSituacao('disponivel', e.tipo)[0];
      if (novo) {
        s.trocar({
          equipamento_devolvido_id: e.id, equipamento_entregue_id: novo.id, motivo: 'troca', condicao: 'bom_estado',
          data, responsavel: sorteio(tecnicos), observacao: 'Upgrade solicitado pelo cliente',
        });
      }
    }
  }

  // Bancada técnica: avalia parte dos aparelhos devolvidos há pelo menos 3 dias (deixa uma fila recente).
  const diasAteHoje = (Date.now() - d.getTime()) / 86400000;
  for (const e of [...comSituacao('aguardando_avaliacao'), ...comSituacao('em_manutencao')]) {
    const parado = (d - new Date(`${e.situacao_desde}T00:00`)) / 86400000;
    if (parado < 3 || diasAteHoje < 12 || !chance(0.25)) continue;
    const ultima = db.prepare(`SELECT * FROM movimentacoes WHERE equipamento_id = ? AND tipo = 'devolucao' ORDER BY id DESC LIMIT 1`).get(e.id);
    let resultado;
    let observacao;
    if (e.situacao === 'em_manutencao') {
      resultado = chance(0.6) ? 'disponivel' : 'baixado';
      observacao = resultado === 'disponivel' ? 'Reparado: firmware regravado e testado' : 'Sem reparo viável';
    } else if (ultima?.motivo === 'queima_relatada') {
      resultado = chance(0.85) ? 'baixado' : 'em_manutencao';
      observacao = resultado === 'baixado' ? 'Placa queimada, sem reparo' : 'Fonte queimada, aguardando peça';
    } else if (ultima?.motivo === 'defeito_relatado') {
      resultado = sorteio(['disponivel', 'em_manutencao', 'em_manutencao', 'baixado']);
      observacao = { disponivel: 'Testado sem defeito; reset de fábrica', em_manutencao: 'Porta PON intermitente', baixado: 'Defeito confirmado na placa' }[resultado];
    } else {
      resultado = chance(0.92) ? 'disponivel' : 'em_manutencao';
      observacao = resultado === 'disponivel' ? 'Testado, higienizado e com reset de fábrica' : 'Sem fonte; aguardando reposição';
    }
    s.avaliar({ equipamento_id: e.id, resultado, data, responsavel: 'Rafael Gomes', observacao });
  }
}

const r = s.resumo();
console.log(`Base de demonstração criada: ${r.total} equipamentos.`, r.por_situacao);
console.log('Acessos: admin@provedor.local / admin123 (administrador) · tecnico@provedor.local / tecnico123 (operador)');
