import type {
  CategoriaServico, Cliente, Compromisso, Contrato, Database, Equipamento, Lancamento, Movimento, Oportunidade,
  Orcamento, OrdemServico, Peca, Servico, Tarefa, Turma, Usuario, Modulo, Perfil,
} from '../types';
import { addDays, pad, toISODate } from '../utils/format';

/** PRNG determinístico para que os dados de demonstração sejam sempre os mesmos. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SERVICOS: Record<CategoriaServico, { nomes: string[]; faixa: [number, number] }> = {
  'Treinamento': { nomes: ['Treinamento de Informática', 'Treinamento de Excel', 'Curso de Pacote Office'], faixa: [350, 900] },
  'Manutenção': { nomes: ['Manutenção de Notebook', 'Formatação e Instalação', 'Formatação de PC', 'Upgrade de PC'], faixa: [150, 480] },
  'Desenvolvimento Web': { nomes: ['Desenvolvimento de Site', 'Criação de Site', 'Site institucional', 'Loja virtual'], faixa: [1800, 4200] },
  'Implantação': { nomes: ['Implantação de Rede', 'Implantação de Servidor', 'Configuração de Backup'], faixa: [800, 2200] },
  'Consultoria': { nomes: ['Consultoria em TI', 'Diagnóstico de Infraestrutura'], faixa: [300, 750] },
};
export const CATEGORIAS = Object.keys(SERVICOS) as CategoriaServico[];
export const CATEGORIAS_DESPESA = ['Peças e acessórios', 'Transporte', 'Marketing', 'Software e licenças', 'Impostos', 'Outros'];
/** Receitas aceitam também a categoria de mensalidades de contratos. */
export const CATEGORIAS_RECEITA = [...CATEGORIAS, 'Recorrência'];
/** Versão do formato dos dados; ao subir, `migrar` completa bases antigas com os módulos novos. */
export const VERSAO_DADOS = 2;

/** Catálogo padrão: nome, categoria, preço de tabela, custo direto, horas. */
const SERV_DEFS: [string, CategoriaServico, number, number, number][] = [
  // nome, categoria, preço de tabela, custo direto, horas
  ['Treinamento de Informática', 'Treinamento', 650, 80, 12], ['Treinamento de Excel', 'Treinamento', 550, 60, 8],
  ['Curso de Pacote Office', 'Treinamento', 800, 90, 16], ['Manutenção de Notebook', 'Manutenção', 320, 60, 2.5],
  ['Formatação e Instalação', 'Manutenção', 280, 20, 2], ['Formatação de PC', 'Manutenção', 260, 20, 2],
  ['Upgrade de PC', 'Manutenção', 380, 40, 1.5], ['Manutenção preventiva', 'Manutenção', 650, 60, 5],
  ['Desenvolvimento de Site', 'Desenvolvimento Web', 3200, 250, 40], ['Criação de Site', 'Desenvolvimento Web', 3200, 250, 45],
  ['Site institucional', 'Desenvolvimento Web', 3200, 250, 42], ['Loja virtual', 'Desenvolvimento Web', 4500, 450, 70],
  ['Implantação de Rede', 'Implantação', 1800, 300, 12], ['Implantação de Servidor', 'Implantação', 2200, 350, 16],
  ['Configuração de Backup', 'Implantação', 1100, 150, 6], ['Consultoria em TI', 'Consultoria', 600, 30, 4],
  ['Diagnóstico de Infraestrutura', 'Consultoria', 700, 40, 5],
];
const PRECO_TABELA: Record<string, number> = Object.fromEntries(SERV_DEFS.map(([n, , p]) => [n, p]));

export const MODULOS: { id: Modulo; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'orcamentos', label: 'Orçamentos e Propostas' },
  { id: 'funil', label: 'Funil Comercial' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'ordens', label: 'Ordens de Serviço' },
  { id: 'equipamentos', label: 'Equipamentos' },
  { id: 'estoque', label: 'Estoque de Peças' },
  { id: 'treinamentos', label: 'Treinamentos' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'servicos', label: 'Serviços e Preços' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'configuracoes', label: 'Configurações' },
];

export const PERMISSOES_PADRAO: Record<Perfil, Modulo[]> = {
  'Proprietário': MODULOS.map((m) => m.id),
  'Operador': ['inicio', 'clientes', 'orcamentos', 'funil', 'contratos', 'ordens', 'equipamentos', 'estoque', 'treinamentos', 'agenda', 'servicos'],
  'Financeiro': ['inicio', 'clientes', 'contratos', 'financeiro', 'relatorios', 'planejamento', 'servicos'],
  'Técnico': ['inicio', 'ordens', 'equipamentos', 'estoque', 'agenda'],
};

export function createSeed(): Database {
  const rnd = mulberry32(20250930);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => Math.round((a + rnd() * (b - a)) / 10) * 10;
  const now = new Date();
  const hoje = toISODate(now);
  const d = (offset: number) => addDays(hoje, offset);

  const clientesBase: [string, Cliente['tipo'], string, string][] = [
    ['Maria Oliveira', 'Pessoa Física', '(27) 99999-1234', 'maria@email.com'],
    ['Empresa Tech', 'Pessoa Jurídica', '(27) 98888-5678', 'contato@empresatech.com'],
    ['Carlos Souza', 'Pessoa Física', '(27) 97777-4321', 'carlos@email.com'],
    ['Ana Costa', 'Pessoa Física', '(27) 96666-9876', 'ana@email.com'],
    ['Loja Digital', 'Pessoa Jurídica', '(27) 95555-3456', 'loja@digital.com'],
    ['Escola Saber', 'Pessoa Jurídica', '(27) 3322-1100', 'secretaria@escolasaber.com'],
    ['João Pedro', 'Pessoa Física', '(27) 99123-4567', 'joaopedro@email.com'],
    ['Tech Solutions', 'Pessoa Jurídica', '(27) 3030-4040', 'ti@techsolutions.com'],
    ['Instituto Educar', 'Pessoa Jurídica', '(27) 3211-9090', 'contato@educar.org'],
    ['Clínica Vida', 'Pessoa Jurídica', '(27) 3344-5566', 'adm@clinicavida.com'],
    ['Comércio Santos', 'Pessoa Jurídica', '(27) 3456-7788', 'financeiro@santos.com'],
    ['Empresa Alfa', 'Pessoa Jurídica', '(27) 3099-8877', 'contato@alfa.com'],
    ['Marcelo Lima', 'Pessoa Física', '(27) 98765-1111', 'marcelo@email.com'],
    ['Roberto Alves', 'Pessoa Física', '(27) 99888-2222', 'roberto@email.com'],
    ['Padaria Pão Quente', 'Pessoa Jurídica', '(27) 3222-3333', 'paoquente@email.com'],
  ];
  const ruas = ['R. das Acácias, 123', 'Av. Central, 450', 'R. Vitória, 89', 'Av. Brasil, 1020', 'R. São Paulo, 77', 'R. das Palmeiras, 310'];
  const cidades = ['Cariacica/ES', 'Vitória/ES', 'Vila Velha/ES', 'Serra/ES'];

  const clientes: Cliente[] = clientesBase.map(([nome, tipo, telefone, email], i) => ({
    id: `c${i + 1}`,
    nome, tipo, telefone, email,
    documento: tipo === 'Pessoa Física'
      ? `${100 + i}.${200 + i * 3}.${300 + i * 7}-${pad(i * 3 % 100)}`
      : `${10 + i}.${300 + i}.${400 + i * 2}/0001-${pad(i * 5 % 100)}`,
    endereco: ruas[i % ruas.length],
    cidade: cidades[i % cidades.length],
    status: i === 13 ? 'Inativo' : 'Ativo',
    criadoEm: d(-(380 - i * 22)),
  }));

  // Clientes com peso de compra (Pareto: poucos clientes concentram receita)
  const pesos = [9, 14, 6, 5, 10, 8, 3, 7, 4, 5, 3, 4, 2, 1, 2];
  const pool = clientes.flatMap((c, i) => Array(pesos[i]).fill(c.id) as string[]);

  // ---------- Lançamentos (12 meses + mês atual até hoje) ----------
  const lancamentos: Lancamento[] = [];
  let lid = 1;
  for (let m = 12; m >= 0; m--) {
    const inicio = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const diasNoMes = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
    const ultimoDia = m === 0 ? now.getDate() : diasNoMes;
    const crescimento = 1 + (12 - m) * 0.025; // leve tendência de alta
    const sazonal = [0.85, 0.9, 1.05, 1, 1, 0.95, 1.1, 1.05, 1, 1.05, 1.1, 0.8][inicio.getMonth()];
    const qtdReceitas = Math.round((7 + rnd() * 4) * sazonal * (ultimoDia / diasNoMes));
    for (let k = 0; k < qtdReceitas; k++) {
      const cat = pick(['Treinamento', 'Treinamento', 'Manutenção', 'Manutenção', 'Manutenção', 'Desenvolvimento Web', 'Implantação', 'Consultoria'] as CategoriaServico[]);
      const serv = SERVICOS[cat];
      const dia = 1 + Math.floor(rnd() * ultimoDia);
      const data = `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(dia)}`;
      const clienteId = pick(pool);
      const nome = pick(serv.nomes);
      lancamentos.push({
        id: `l${lid++}`, tipo: 'Receita', descricao: nome, categoria: cat,
        // preço praticado oscila em torno da tabela; sites costumam sair com desconto na negociação
        valor: (PRECO_TABELA[nome] ?? between(serv.faixa[0], serv.faixa[1])) * (cat === 'Desenvolvimento Web' ? 0.78 + rnd() * 0.17 : 0.9 + rnd() * 0.15) * (cat === 'Desenvolvimento Web' ? 1 : crescimento / 1.15),
        data, status: m === 0 && dia > now.getDate() - 5 ? 'Pendente' : 'Pago', clienteId,
      });
    }
    const despesasFixas: [string, string, number][] = [
      ['Software e licenças', 'Licenças e assinaturas', 180],
      ['Marketing', 'Anúncios em redes sociais', 350],
      ['Transporte', 'Combustível e deslocamentos', 420],
    ];
    for (const [cat, desc, base] of despesasFixas) {
      const dia = Math.min(ultimoDia, 5 + Math.floor(rnd() * 20));
      lancamentos.push({
        id: `l${lid++}`, tipo: 'Despesa', descricao: desc, categoria: cat,
        valor: Math.round(base * (0.85 + rnd() * 0.3)),
        data: `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(dia)}`, status: 'Pago',
      });
    }
    const qtdPecas = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < qtdPecas; k++) {
      const dia = 1 + Math.floor(rnd() * ultimoDia);
      lancamentos.push({
        id: `l${lid++}`, tipo: 'Despesa', descricao: pick(['SSD 480GB', 'Memória RAM 8GB', 'Fonte ATX', 'Cabo de rede', 'Teclado e mouse', 'Bateria de notebook']),
        categoria: 'Peças e acessórios', valor: between(120, 520),
        data: `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(dia)}`, status: 'Pago',
      });
    }
    lancamentos.push({
      id: `l${lid++}`, tipo: 'Despesa', descricao: 'DAS - Simples Nacional (MEI)', categoria: 'Impostos',
      valor: 76, data: `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(Math.min(20, ultimoDia))}`,
      status: m === 0 && now.getDate() < 20 ? 'Pendente' : 'Pago',
    });
  }
  lancamentos.forEach((l) => (l.valor = Math.round(l.valor)));

  // ---------- Orçamentos ----------
  const orcDefs: [number, string, CategoriaServico, number, number, Orcamento['status']][] = [
    // clienteIdx, serviço, categoria, valor, dias desde criação, status
    [7, 'Implantação de Rede', 'Implantação', 1850, 70, 'Convertido'],
    [3, 'Treinamento de Excel', 'Treinamento', 480, 62, 'Recusado'],
    [5, 'Treinamento de Informática', 'Treinamento', 1200, 55, 'Convertido'],
    [10, 'Site institucional', 'Desenvolvimento Web', 2800, 48, 'Recusado'],
    [9, 'Manutenção preventiva', 'Manutenção', 650, 40, 'Recusado'],
    [8, 'Treinamento de Informática', 'Treinamento', 900, 33, 'Convertido'],
    [0, 'Formatação e Instalação', 'Manutenção', 250, 27, 'Convertido'],
    [4, 'Criação de Site', 'Desenvolvimento Web', 3200, 12, 'Proposta enviada'],
    [3, 'Treinamento de Informática', 'Treinamento', 600, 14, 'Orçamento'],
    [2, 'Manutenção de Notebook', 'Manutenção', 280, 9, 'Convertido'],
    [0, 'Formatação de PC', 'Manutenção', 350, 5, 'Em análise'],
    [1, 'Desenvolvimento de Site', 'Desenvolvimento Web', 2500, 3, 'Proposta enviada'],
  ];
  const orcamentos: Orcamento[] = orcDefs.map(([ci, servico, categoria, valor, dias, status], i) => ({
    id: `o${i + 1}`, numero: `OR-${pad(i + 1).padStart(3, '0')}`, clienteId: clientes[ci].id,
    servico, categoria, valor, criadoEm: d(-dias), validade: d(-dias + 15), status,
  }));

  // ---------- Funil ----------
  const funilDefs: [string, string, number, Oportunidade['etapa'], number?][] = [
    ['Empresa Tech', 'Site institucional', 3500, 'Leads', 1], ['João Pedro', 'Manutenção PC', 250, 'Leads', 6],
    ['Escola Saber', 'Treinamento', 1400, 'Leads', 5], ['Padaria Pão Quente', 'Sistema de caixa', 1800, 'Leads', 14],
    ['Ótica Visão', 'Site institucional', 2600, 'Leads'], ['Academia Forma', 'Rede Wi-Fi', 900, 'Leads'],
    ['Pet Shop Amigo', 'Loja virtual', 4200, 'Leads'], ['Luiza Mendes', 'Formatação', 200, 'Leads'],
    ['Maria Oliveira', 'Formatação', 350, 'Em contato', 0], ['Carlos Souza', 'Manutenção', 280, 'Em contato', 2],
    ['Loja Digital', 'Site', 3200, 'Em contato', 4], ['Auto Peças Silva', 'Backup em nuvem', 1100, 'Em contato'],
    ['Studio Arte', 'Site portfólio', 1900, 'Em contato'], ['Dr. Paulo Nunes', 'Manutenção', 300, 'Em contato'],
    ['Ana Costa', 'Treinamento', 600, 'Proposta', 3], ['Tech Solutions', 'Site + Manutenção', 3800, 'Proposta', 7],
    ['Roberto Alves', 'Upgrade de PC', 750, 'Proposta', 13], ['Instituto Educar', 'Treinamento', 900, 'Proposta', 8],
    ['Instituto Educar', 'Laboratório de informática', 2400, 'Negociação', 8], ['Clínica Vida', 'Manutenção', 650, 'Negociação', 9],
    ['Comércio Santos', 'Site', 2800, 'Negociação', 10],
    ['Empresa Alfa', 'Site institucional', 2900, 'Fechados', 11], ['Marcelo Lima', 'Formatação', 220, 'Fechados', 12],
  ];
  const oportunidades: Oportunidade[] = funilDefs.map(([titulo, servico, valor, etapa, ci], i) => ({
    id: `f${i + 1}`, titulo, servico, valor, etapa,
    clienteId: ci !== undefined ? clientes[ci].id : undefined,
    criadoEm: d(-(30 - i)), atualizadoEm: d(-Math.floor(rnd() * 12)),
  }));

  // ---------- Ordens de serviço ----------
  const osDefs: [number, string, CategoriaServico, number, number, OrdemServico['status'], number][] = [
    // cliente, serviço, cat, abertura(dias atrás), prazo(dias após abertura), status, valor
    [4, 'Criação de Site', 'Desenvolvimento Web', 15, 15, 'Finalizada', 3200],
    [3, 'Treinamento de Informática', 'Treinamento', 12, 15, 'Em andamento', 600],
    [2, 'Manutenção de Notebook', 'Manutenção', 10, 11, 'Aguardando peças', 280],
    [1, 'Desenvolvimento de Site', 'Desenvolvimento Web', 7, 11, 'Em andamento', 2500],
    [0, 'Formatação e Instalação', 'Manutenção', 5, 7, 'Em andamento', 250],
    [7, 'Implantação de Rede', 'Implantação', 30, 10, 'Finalizada', 1850],
    [5, 'Treinamento de Informática', 'Treinamento', 26, 20, 'Finalizada', 1200],
    [9, 'Manutenção preventiva', 'Manutenção', 9, 5, 'Em andamento', 650],
    [12, 'Formatação de PC', 'Manutenção', 20, 3, 'Finalizada', 220],
    [11, 'Site institucional', 'Desenvolvimento Web', 18, 30, 'Em andamento', 2900],
    [6, 'Upgrade de PC', 'Manutenção', 4, 5, 'Aberta', 540],
    [8, 'Configuração de Backup', 'Implantação', 2, 6, 'Aberta', 980],
    [13, 'Manutenção de Notebook', 'Manutenção', 45, 5, 'Cancelada', 300],
    [10, 'Diagnóstico de Infraestrutura', 'Consultoria', 8, 4, 'Aguardando peças', 450],
    [14, 'Formatação e Instalação', 'Manutenção', 1, 3, 'Aberta', 230],
  ];
  const tecnicos = ['Saymon Ramos', 'Lucas Martins'];
  const ordens: OrdemServico[] = osDefs.map(([ci, servico, categoria, abertura, prazo, status, valor], i) => {
    const ab = d(-abertura);
    const pr = addDays(ab, prazo);
    return {
      id: `os${i + 1}`, numero: `OS-${String(i + 1).padStart(3, '0')}`, clienteId: clientes[ci].id,
      servico, categoria, abertura: ab, prazo: pr, status, valor,
      conclusao: status === 'Finalizada' ? addDays(ab, Math.max(1, prazo - 2 + (i % 4))) : undefined,
      tecnico: tecnicos[i % 2],
    };
  });

  // ---------- Equipamentos ----------
  const eqDefs: [string, string, Equipamento['tipo'], number, Equipamento['status'], number][] = [
    ['Notebook Inspiron 15', 'Dell', 'Notebook', 0, 'Em uso', 400],
    ['Desktop i5', 'Positivo', 'Computador', 1, 'Em uso', 700],
    ['Impressora LaserJet', 'HP', 'Impressora', 2, 'Em uso', 900],
    ['Notebook Aspire 5', 'Acer', 'Notebook', 3, 'Em manutenção', 300],
    ['Servidor PowerEdge T40', 'Dell', 'Servidor', 4, 'Em uso', 500],
    ['Notebook IdeaPad 3', 'Lenovo', 'Notebook', 2, 'Em manutenção', 600],
    ['Roteador Archer C6', 'TP-Link', 'Rede', 7, 'Em uso', 200],
    ['Desktop OptiPlex', 'Dell', 'Computador', 9, 'Em uso', 1100],
    ['Multifuncional L3250', 'Epson', 'Impressora', 5, 'Em uso', 250],
    ['Notebook VivoBook', 'Asus', 'Notebook', 13, 'Inativo', 1500],
    ['Switch 24 portas', 'Intelbras', 'Rede', 8, 'Em uso', 90],
    ['Desktop Core i3', 'Multilaser', 'Computador', 6, 'Em manutenção', 800],
  ];
  const equipamentos: Equipamento[] = eqDefs.map(([nome, marca, tipo, ci, status, dias], i) => ({
    id: `e${i + 1}`, nome, marca, tipo, clienteId: clientes[ci].id, status,
    numeroSerie: `${marca.slice(0, 2).toUpperCase()}${(734921 + i * 7919).toString(36).toUpperCase()}`,
    dataAquisicao: d(-dias), garantiaMeses: tipo === 'Servidor' ? 36 : 12,
  }));
  // Avaliações (0–10) dadas pelos clientes nas OS finalizadas
  const notas = [10, 9, 10, 6];
  ordens.filter((o) => o.status === 'Finalizada').forEach((o, i) => (o.avaliacao = notas[i % notas.length]));
  ordens[4].equipamentoId = 'e1';
  ordens[2].equipamentoId = 'e6';
  ordens[7].equipamentoId = 'e8';

  // ---------- Agenda ----------
  const compromissos: Compromisso[] = [
    { id: 'a1', titulo: 'Treinamento de Informática', tipo: 'Treinamento', data: d(0), inicio: '09:00', fim: '10:00', clienteId: 'c6', local: 'Escola Saber' },
    { id: 'a2', titulo: 'Manutenção de Notebook', tipo: 'Manutenção', data: d(0), inicio: '10:30', fim: '12:00', clienteId: 'c3' },
    { id: 'a3', titulo: 'Reunião de Proposta', tipo: 'Reunião', data: d(0), inicio: '14:00', fim: '15:00', clienteId: 'c2' },
    { id: 'a4', titulo: 'Atendimento Cliente', tipo: 'Atendimento', data: d(0), inicio: '16:00', fim: '17:00', clienteId: 'c4' },
    { id: 'a5', titulo: 'Visita técnica - rede', tipo: 'Manutenção', data: d(1), inicio: '08:30', fim: '10:00', clienteId: 'c9' },
    { id: 'a6', titulo: 'Apresentação de layout do site', tipo: 'Reunião', data: d(1), inicio: '15:00', fim: '16:00', clienteId: 'c5' },
    { id: 'a7', titulo: 'Treinamento de Excel', tipo: 'Treinamento', data: d(2), inicio: '09:00', fim: '11:00', clienteId: 'c9' },
    { id: 'a8', titulo: 'Negociação - laboratório', tipo: 'Reunião', data: d(3), inicio: '10:00', fim: '11:00', clienteId: 'c9' },
    { id: 'a9', titulo: 'Entrega de equipamento', tipo: 'Atendimento', data: d(-1), inicio: '11:00', fim: '11:30', clienteId: 'c1' },
    { id: 'a10', titulo: 'Manutenção preventiva', tipo: 'Manutenção', data: d(4), inicio: '14:00', fim: '17:00', clienteId: 'c10' },
  ];
  const tarefas: Tarefa[] = [
    { id: 't1', titulo: 'Enviar proposta para Empresa Tech', data: d(0), concluida: true, prioridade: 'Alta' },
    { id: 't2', titulo: 'Comprar peças para manutenção', data: d(0), concluida: false, prioridade: 'Alta' },
    { id: 't3', titulo: 'Retornar ligação do João Pedro', data: d(0), concluida: false, prioridade: 'Média' },
    { id: 't4', titulo: 'Atualizar site da loja digital', data: d(0), concluida: false, prioridade: 'Baixa' },
    { id: 't5', titulo: 'Cobrar pagamento pendente', data: d(1), concluida: false, prioridade: 'Alta' },
  ];

  const hora = (dias: number, h: number, m: number) => {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dias, h, m);
    return x.toISOString();
  };
  const usuarios: Usuario[] = [
    { id: 'u1', nome: 'Saymon Ramos', email: 'saymon@techgest.com', perfil: 'Proprietário', status: 'Ativo', ultimoAcesso: hora(0, 8, 32) },
    { id: 'u2', nome: 'Ana Souza', email: 'ana@techgest.com', perfil: 'Operador', status: 'Ativo', ultimoAcesso: hora(-1, 18, 45) },
    { id: 'u3', nome: 'Carlos Silva', email: 'carlos@techgest.com', perfil: 'Financeiro', status: 'Ativo', ultimoAcesso: hora(-1, 14, 20) },
    { id: 'u4', nome: 'Lucas Martins', email: 'lucas@techgest.com', perfil: 'Técnico', status: 'Ativo', ultimoAcesso: hora(-3, 9, 5) },
  ];

  // ---------- Catálogo de serviços ----------
  const servicos: Servico[] = SERV_DEFS.map(([nome, categoria, preco, custo, duracaoHoras], i) => ({
    id: `s${i + 1}`, nome, categoria, preco, custo, duracaoHoras, ativo: true,
  }));

  // ---------- Estoque de peças ----------
  const pecaDefs: [string, Peca['categoria'], number, number, number, number, string, number][] = [
    // nome, categoria, qtd, mínimo, custo, venda, fornecedor, consumo em 90 dias
    ['SSD 480GB', 'Armazenamento', 3, 4, 220, 320, 'InfoParts', 6], ['Memória RAM 8GB DDR4', 'Memória', 6, 4, 150, 230, 'InfoParts', 7],
    ['Fonte ATX 500W', 'Energia', 1, 2, 180, 260, 'Distribuidora Vix', 3], ['Cabo de rede Cat6 (metro)', 'Rede', 120, 50, 2.5, 5, 'Rede Forte', 95],
    ['Teclado e mouse USB', 'Periféricos', 5, 3, 60, 95, 'Distribuidora Vix', 4], ['Bateria de notebook', 'Energia', 0, 2, 190, 290, 'InfoParts', 3],
    ['Pasta térmica', 'Outros', 8, 3, 15, 30, 'InfoParts', 6], ['HD externo 1TB', 'Armazenamento', 2, 2, 280, 390, 'Distribuidora Vix', 2],
    ['Roteador Wi-Fi AC1200', 'Rede', 2, 1, 170, 260, 'Rede Forte', 2], ['Conector RJ45', 'Rede', 80, 50, 0.8, 2, 'Rede Forte', 64],
  ];
  const pecas: Peca[] = pecaDefs.map(([nome, categoria, quantidade, minimo, custoUnit, precoVenda, fornecedor], i) => ({
    id: `p${i + 1}`, nome, categoria, quantidade, minimo, custoUnit, precoVenda, fornecedor,
    sku: `PC-${String(i + 1).padStart(3, '0')}`,
  }));
  const movimentos: Movimento[] = [];
  let mid = 1;
  const osComPeca = ['os1', 'os5', 'os6', 'os9', 'os8', 'os11'];
  pecaDefs.forEach(([, , qtd, , custo, , , consumo], i) => {
    const partes = Math.min(4, Math.max(1, Math.round(consumo / 10) || 1));
    let restante = consumo;
    for (let k = 0; k < partes; k++) {
      const q = k === partes - 1 ? restante : Math.max(1, Math.round(consumo / partes));
      restante -= q;
      if (q <= 0) continue;
      movimentos.push({
        id: `m${mid++}`, pecaId: `p${i + 1}`, tipo: 'Saída', quantidade: q, data: d(-Math.floor(5 + rnd() * 80)),
        osId: k === 0 ? osComPeca[i % osComPeca.length] : undefined,
      });
    }
    movimentos.push({ id: `m${mid++}`, pecaId: `p${i + 1}`, tipo: 'Entrada', quantidade: qtd + consumo, data: d(-95), custoUnit: custo, obs: 'Compra trimestral' });
  });

  // ---------- Contratos recorrentes ----------
  const mesAnterior = (() => { const x = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; })();
  const ctDefs: [number, Contrato['tipo'], string, number, number, number, number, Contrato['status']][] = [
    // cliente, tipo, descrição, valor, início (dias atrás), renovação (dias a partir de hoje), dia venc., status
    [1, 'Suporte mensal', 'Suporte técnico remoto e presencial (até 8h/mês)', 450, 300, 65, 10, 'Ativo'],
    [4, 'Hospedagem de site', 'Hospedagem + certificado SSL da loja virtual', 89, 200, 165, 5, 'Ativo'],
    [7, 'Suporte mensal', 'Suporte de TI para 12 estações', 600, 400, 20, 15, 'Ativo'],
    [9, 'Manutenção preventiva', 'Revisão mensal de computadores e rede', 320, 150, 215, 20, 'Ativo'],
    [11, 'Hospedagem de site', 'Hospedagem do site institucional', 99, 90, 275, 8, 'Ativo'],
    [10, 'Domínio e e-mail', 'Domínio .com.br + 5 contas de e-mail', 45, 330, 12, 1, 'Ativo'],
    [5, 'Suporte mensal', 'Suporte ao laboratório de informática', 380, 240, -20, 12, 'Cancelado'],
  ];
  const contratos: Contrato[] = ctDefs.map(([ci, tipo, descricao, valorMensal, ini, ren, diaVencimento, status], i) => ({
    id: `ct${i + 1}`, clienteId: clientes[ci].id, tipo, descricao, valorMensal, inicio: d(-ini), renovacao: d(ren),
    diaVencimento, status, ultimaCobranca: status === 'Ativo' ? mesAnterior : undefined,
  }));
  // Mensalidades já cobradas nos últimos 6 meses (até o mês anterior)
  for (const c of contratos) {
    for (let m = 6; m >= 1; m--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const data = `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-${pad(Math.min(c.diaVencimento, 28))}`;
      if (data < c.inicio || (c.status === 'Cancelado' && data > c.renovacao)) continue;
      lancamentos.push({
        id: `l${lid++}`, tipo: 'Receita', descricao: `${c.tipo} - mensalidade`, categoria: 'Recorrência',
        valor: c.valorMensal, data, status: 'Pago', clienteId: c.clienteId,
      });
    }
  }

  // ---------- Turmas de treinamento ----------
  const nomesAlunos = ['Ana Paula', 'Bruno Lima', 'Carla Dias', 'Diego Rocha', 'Elaine Souza', 'Fábio Nunes', 'Gabriela Reis', 'Henrique Alves',
    'Isabela Moura', 'José Carlos', 'Karen Lopes', 'Leandro Costa', 'Mariana Freitas', 'Nelson Prado', 'Olívia Santos'];
  const alunos = (n: number, naoPagos = 0) => nomesAlunos.slice(0, n).map((nome, i) => ({ nome, pago: i < n - naoPagos }));
  const turmas: Turma[] = [
    { id: 'tu1', curso: 'Excel Básico', inicio: d(6), fim: d(27), horario: 'Ter e Qui · 19h–21h', local: 'Sala TechGest', vagas: 12, precoAluno: 380, custoTurma: 1800, status: 'Inscrições abertas', alunos: alunos(4, 1) },
    { id: 'tu2', curso: 'Informática para Iniciantes', inicio: d(-10), fim: d(20), horario: 'Seg e Qua · 14h–16h', local: 'Escola Saber', vagas: 15, precoAluno: 300, custoTurma: 1600, status: 'Em andamento', alunos: alunos(13, 2) },
    { id: 'tu3', curso: 'Pacote Office Completo', inicio: d(20), fim: d(55), horario: 'Sáb · 8h–12h', local: 'Sala TechGest', vagas: 10, precoAluno: 650, custoTurma: 2000, status: 'Inscrições abertas', alunos: alunos(7, 3) },
    { id: 'tu4', curso: 'Excel Avançado', inicio: d(-60), fim: d(-30), horario: 'Ter e Qui · 19h–21h', local: 'Sala TechGest', vagas: 10, precoAluno: 520, custoTurma: 1800, status: 'Concluída', alunos: alunos(9) },
  ];

  return {
    clientes, orcamentos, oportunidades, ordens, equipamentos, compromissos, tarefas, lancamentos, usuarios,
    servicos, pecas, movimentos, contratos, turmas,
    permissoes: PERMISSOES_PADRAO,
    empresa: {
      nome: 'TechGest', cnpj: '45.123.456/0001-78', telefone: '(27) 99999-0000', email: 'contato@techgest.com',
      endereco: 'Cariacica/ES', metaMensal: 12000, diasAlertaOrcamento: 5, versaoDados: VERSAO_DADOS,
    },
  };
}

const NOVAS_COLECOES = ['servicos', 'pecas', 'movimentos', 'contratos', 'turmas'] as const;
const NOVOS_MODULOS: Modulo[] = ['servicos', 'estoque', 'contratos', 'treinamentos', 'planejamento'];

/**
 * Completa uma base criada numa versão anterior com as coleções e permissões dos módulos novos,
 * preservando todos os dados existentes. Retorna null quando não há nada a migrar.
 */
export function migrar(db: Database): Database | null {
  if ((db.empresa?.versaoDados ?? 1) >= VERSAO_DADOS) return null;
  const seed = createSeed();
  const out = { ...db } as Database;
  for (const col of NOVAS_COLECOES) {
    if (!Array.isArray(out[col]) || out[col].length === 0) {
      (out as unknown as Record<string, unknown>)[col] = seed[col];
      // contratos de demonstração vêm com o histórico de mensalidades já pagas
      if (col === 'contratos') {
        const ids = new Set(out.lancamentos.map((l) => l.id));
        const recorrentes = seed.lancamentos.filter((l) => l.categoria === 'Recorrência').map((l) => ({ ...l, id: ids.has(l.id) ? `${l.id}-r` : l.id }));
        out.lancamentos = [...out.lancamentos, ...recorrentes];
      }
    }
  }
  const permissoes = { ...out.permissoes };
  (Object.keys(PERMISSOES_PADRAO) as Perfil[]).forEach((perfil) => {
    const atuais = permissoes[perfil] ?? [];
    const novos = PERMISSOES_PADRAO[perfil].filter((m) => NOVOS_MODULOS.includes(m) && !atuais.includes(m));
    permissoes[perfil] = [...atuais, ...novos];
  });
  out.permissoes = permissoes;
  out.empresa = { ...out.empresa, versaoDados: VERSAO_DADOS };
  return out;
}
