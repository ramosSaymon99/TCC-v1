import type { Empresa } from '../types';

/**
 * Perfis de negócio por segmento. O Pivot Hub é neutro: categorias, catálogo inicial, materiais de estoque,
 * tipos de ativo/agenda/contrato e os nomes de algumas telas vêm do segmento escolhido no cadastro da empresa.
 * Tudo pode ser ajustado depois em Configurações (Empresa.listas).
 */
export interface Rotulos {
  ativo: string;        // singular: Equipamento, Veículo, Pet...
  ativos: string;       // plural (nome do módulo)
  marca: string;        // campo "marca" do ativo: Marca, Raça, Modelo...
  serie: string;        // campo "nº de série": Placa, Microchip...
  aquisicao: string;    // campo de data: Data de aquisição, Nascimento...
  usaGarantia: boolean; // mostra garantia e alerta de garantia vencendo
  material: string;     // singular: Peça, Produto, Insumo...
  materiais: string;    // plural (nome do estoque)
  profissional: string; // responsável pela OS: Técnico, Mecânico, Profissional...
  turmas: string;       // nome do módulo de turmas: Treinamentos, Cursos, Workshops...
  ordem: string;        // singular da OS: Ordem de serviço, Pedido, Encomenda, Atendimento...
  ordens: string;       // plural (nome do módulo)
  sigla: string;        // forma curta usada em botões e alertas: OS, pedido, encomenda...
  novaOrdem: string;    // texto do botão de criação: Nova OS, Novo pedido...
  prefixo: string;      // prefixo da numeração: OS, PED, ENC, AT
  catalogo: string;     // nome do catálogo: Serviços e Preços, Cardápio e Preços...
}

export interface PerfilNegocio {
  id: string;
  nome: string;
  exemplos: string;
  rotulos: Rotulos;
  categoriasServico: string[];
  /** nome, categoria, preço de tabela, custo direto, horas */
  servicos: [string, string, number, number, number][];
  tiposAtivo: string[];
  categoriasMaterial: string[];
  /** nome, categoria, custo unitário, preço de venda, estoque mínimo */
  materiais: [string, string, number, number, number][];
  tiposCompromisso: string[];
  tiposContrato: string[];
  categoriasDespesa: string[];
}

/** Listas que a empresa pode personalizar em Configurações. */
export type ListaEditavel = 'categoriasServico' | 'tiposAtivo' | 'categoriasMaterial' | 'tiposCompromisso' | 'tiposContrato' | 'categoriasDespesa';
export const LISTAS_EDITAVEIS: { id: ListaEditavel; rotulo: string }[] = [
  { id: 'categoriasServico', rotulo: 'Categorias de serviço' },
  { id: 'tiposAtivo', rotulo: 'Tipos de ativo do cliente' },
  { id: 'categoriasMaterial', rotulo: 'Categorias do estoque' },
  { id: 'tiposCompromisso', rotulo: 'Tipos de compromisso na agenda' },
  { id: 'tiposContrato', rotulo: 'Tipos de contrato recorrente' },
  { id: 'categoriasDespesa', rotulo: 'Categorias de despesa' },
];

const R = (o: Partial<Rotulos>): Rotulos => ({
  ativo: 'Equipamento', ativos: 'Equipamentos', marca: 'Marca/modelo', serie: 'Identificação', aquisicao: 'Data de aquisição', usaGarantia: true,
  material: 'Material', materiais: 'Materiais', profissional: 'Responsável', turmas: 'Cursos e Turmas',
  ordem: 'Ordem de serviço', ordens: 'Ordens de Serviço', sigla: 'OS', novaOrdem: 'Nova OS', prefixo: 'OS', catalogo: 'Serviços e Preços', ...o,
});
const DESPESAS_BASE = ['Materiais e insumos', 'Transporte', 'Marketing', 'Software e assinaturas', 'Aluguel e contas', 'Impostos', 'Outros'];

export const SEGMENTOS: PerfilNegocio[] = [
  {
    id: 'generico', nome: 'Serviços em geral', exemplos: 'Prestadores de serviço de qualquer área',
    rotulos: R({ ativo: 'Item do cliente', ativos: 'Itens de Clientes', marca: 'Marca/modelo', serie: 'Identificação', profissional: 'Responsável', material: 'Material', materiais: 'Materiais' }),
    categoriasServico: ['Serviço avulso', 'Pacote', 'Manutenção', 'Consultoria', 'Outros'],
    servicos: [['Atendimento padrão', 'Serviço avulso', 150, 20, 1], ['Visita técnica', 'Serviço avulso', 120, 30, 1], ['Pacote mensal', 'Pacote', 450, 60, 4], ['Manutenção', 'Manutenção', 200, 40, 2], ['Consultoria (hora)', 'Consultoria', 180, 0, 1]],
    tiposAtivo: ['Equipamento', 'Veículo', 'Imóvel', 'Outro'],
    categoriasMaterial: ['Materiais', 'Insumos', 'Produtos para revenda', 'Outros'],
    materiais: [['Material de consumo', 'Insumos', 15, 30, 10], ['Produto para revenda', 'Produtos para revenda', 40, 80, 5]],
    tiposCompromisso: ['Atendimento', 'Visita', 'Reunião', 'Entrega'],
    tiposContrato: ['Plano mensal', 'Manutenção recorrente', 'Assinatura de serviço', 'Suporte'],
    categoriasDespesa: DESPESAS_BASE,
  },
  {
    id: 'tecnologia', nome: 'Tecnologia e informática', exemplos: 'Assistência técnica, suporte de TI, criação de sites, cursos de informática',
    rotulos: R({ ativo: 'Equipamento', ativos: 'Equipamentos', marca: 'Marca', serie: 'Nº de série', material: 'Peça', materiais: 'Peças', profissional: 'Técnico', turmas: 'Treinamentos' }),
    categoriasServico: ['Treinamento', 'Manutenção', 'Desenvolvimento Web', 'Implantação', 'Consultoria'],
    servicos: [
      ['Treinamento de Informática', 'Treinamento', 650, 80, 12], ['Treinamento de Excel', 'Treinamento', 550, 60, 8], ['Manutenção de Notebook', 'Manutenção', 320, 60, 2.5],
      ['Formatação e Instalação', 'Manutenção', 280, 20, 2], ['Upgrade de PC', 'Manutenção', 380, 40, 1.5], ['Criação de Site', 'Desenvolvimento Web', 3200, 250, 45],
      ['Implantação de Rede', 'Implantação', 1800, 300, 12], ['Configuração de Backup', 'Implantação', 1100, 150, 6], ['Consultoria em TI', 'Consultoria', 600, 30, 4],
    ],
    tiposAtivo: ['Notebook', 'Computador', 'Impressora', 'Servidor', 'Rede', 'Outro'],
    categoriasMaterial: ['Armazenamento', 'Memória', 'Energia', 'Periféricos', 'Rede', 'Outros'],
    materiais: [['SSD 480GB', 'Armazenamento', 180, 290, 4], ['Memória DDR4 8GB', 'Memória', 140, 230, 4], ['Fonte ATX 500W', 'Energia', 160, 260, 2], ['Teclado USB', 'Periféricos', 35, 70, 5], ['Cabo de rede (m)', 'Rede', 2, 5, 50]],
    tiposCompromisso: ['Treinamento', 'Manutenção', 'Reunião', 'Atendimento'],
    tiposContrato: ['Suporte mensal', 'Hospedagem de site', 'Manutenção preventiva', 'Domínio e e-mail'],
    categoriasDespesa: ['Peças e acessórios', 'Transporte', 'Marketing', 'Software e licenças', 'Impostos', 'Outros'],
  },
  {
    id: 'automotivo', nome: 'Oficina e serviços automotivos', exemplos: 'Oficina mecânica, autoelétrica, funilaria, estética automotiva, lava-jato',
    rotulos: R({ ativo: 'Veículo', ativos: 'Veículos', marca: 'Marca/modelo', serie: 'Placa', aquisicao: 'Ano / data de entrada', material: 'Peça', materiais: 'Peças', profissional: 'Mecânico', turmas: 'Cursos' }),
    categoriasServico: ['Mecânica', 'Elétrica', 'Funilaria e pintura', 'Revisão', 'Estética automotiva'],
    servicos: [
      ['Troca de óleo e filtro', 'Revisão', 180, 90, 0.5], ['Revisão completa', 'Revisão', 450, 150, 3], ['Alinhamento e balanceamento', 'Mecânica', 140, 10, 1],
      ['Troca de pastilhas de freio', 'Mecânica', 260, 110, 1.5], ['Diagnóstico elétrico', 'Elétrica', 150, 0, 1], ['Polimento e enceramento', 'Estética automotiva', 320, 60, 4],
    ],
    tiposAtivo: ['Carro', 'Moto', 'Caminhonete', 'Caminhão', 'Outro'],
    categoriasMaterial: ['Óleos e fluidos', 'Filtros', 'Freios', 'Elétrica', 'Pneus', 'Outros'],
    materiais: [['Óleo 5W30 (litro)', 'Óleos e fluidos', 32, 55, 20], ['Filtro de óleo', 'Filtros', 18, 40, 10], ['Pastilha de freio (jogo)', 'Freios', 85, 160, 4], ['Bateria 60Ah', 'Elétrica', 380, 560, 2]],
    tiposCompromisso: ['Entrada de veículo', 'Entrega', 'Orçamento', 'Revisão agendada'],
    tiposContrato: ['Manutenção de frota', 'Plano de revisões', 'Lavagem mensal'],
    categoriasDespesa: ['Peças', 'Ferramentas', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'beleza', nome: 'Beleza e estética', exemplos: 'Salão de beleza, estética, manicure, depilação, maquiagem, sobrancelha',
    rotulos: R({ ativo: 'Ficha do cliente', ativos: 'Fichas de Clientes', marca: 'Tipo de pele/cabelo', serie: 'Observação técnica', aquisicao: 'Última avaliação', usaGarantia: false, material: 'Produto', materiais: 'Produtos', profissional: 'Profissional', turmas: 'Cursos', ordem: 'Atendimento', ordens: 'Atendimentos', sigla: 'atendimento', novaOrdem: 'Novo atendimento', prefixo: 'AT' }),
    categoriasServico: ['Cabelo', 'Unhas', 'Estética facial', 'Estética corporal', 'Depilação', 'Maquiagem'],
    servicos: [
      ['Corte feminino', 'Cabelo', 90, 8, 1], ['Escova', 'Cabelo', 60, 6, 0.75], ['Coloração', 'Cabelo', 220, 60, 2], ['Manicure e pedicure', 'Unhas', 70, 10, 1.25],
      ['Limpeza de pele', 'Estética facial', 160, 25, 1.25], ['Maquiagem social', 'Maquiagem', 180, 20, 1.25], ['Depilação pernas', 'Depilação', 80, 12, 0.75],
    ],
    tiposAtivo: ['Ficha de cabelo', 'Ficha de pele', 'Anamnese', 'Outro'],
    categoriasMaterial: ['Cabelo', 'Unhas', 'Estética', 'Descartáveis', 'Revenda'],
    materiais: [['Shampoo profissional (L)', 'Cabelo', 45, 0, 3], ['Coloração (tubo)', 'Cabelo', 22, 0, 10], ['Esmalte', 'Unhas', 6, 0, 20], ['Luvas descartáveis (cx)', 'Descartáveis', 30, 0, 3]],
    tiposCompromisso: ['Atendimento', 'Avaliação', 'Retorno', 'Bloqueio de agenda'],
    tiposContrato: ['Pacote mensal', 'Clube de assinatura', 'Pacote de sessões'],
    categoriasDespesa: ['Produtos', 'Comissões', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'saude', nome: 'Saúde e bem-estar', exemplos: 'Clínica, consultório, odontologia, fisioterapia, psicologia, nutrição',
    rotulos: R({ ativo: 'Prontuário', ativos: 'Prontuários', marca: 'Convênio', serie: 'Nº da carteirinha', aquisicao: 'Data de nascimento', usaGarantia: false, material: 'Insumo', materiais: 'Insumos', profissional: 'Profissional', turmas: 'Grupos e Cursos', ordem: 'Atendimento', ordens: 'Atendimentos', sigla: 'atendimento', novaOrdem: 'Novo atendimento', prefixo: 'AT' }),
    categoriasServico: ['Consulta', 'Retorno', 'Procedimento', 'Exame', 'Sessão', 'Pacote de tratamento'],
    servicos: [['Consulta', 'Consulta', 250, 10, 0.75], ['Retorno', 'Retorno', 120, 5, 0.5], ['Sessão de fisioterapia', 'Sessão', 140, 10, 1], ['Limpeza (profilaxia)', 'Procedimento', 220, 35, 1], ['Avaliação inicial', 'Consulta', 180, 5, 1]],
    tiposAtivo: ['Particular', 'Convênio', 'Outro'],
    categoriasMaterial: ['Descartáveis', 'Medicamentos', 'Materiais clínicos', 'Esterilização', 'Outros'],
    materiais: [['Luvas de procedimento (cx)', 'Descartáveis', 32, 0, 5], ['Máscara descartável (cx)', 'Descartáveis', 18, 0, 5], ['Gaze (pct)', 'Materiais clínicos', 9, 0, 10], ['Álcool 70% (L)', 'Esterilização', 12, 0, 6]],
    tiposCompromisso: ['Consulta', 'Retorno', 'Procedimento', 'Reunião'],
    tiposContrato: ['Plano de acompanhamento', 'Pacote de sessões', 'Convênio empresarial'],
    categoriasDespesa: ['Insumos', 'Laboratório', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'educacao', nome: 'Educação e cursos', exemplos: 'Escola de idiomas, cursos livres, reforço escolar, música, autoescola',
    rotulos: R({ ativo: 'Material do aluno', ativos: 'Materiais de Alunos', marca: 'Curso', serie: 'Matrícula', aquisicao: 'Data de entrega', usaGarantia: false, material: 'Material didático', materiais: 'Materiais Didáticos', profissional: 'Professor', turmas: 'Turmas', ordem: 'Solicitação', ordens: 'Solicitações', sigla: 'solicitação', novaOrdem: 'Nova solicitação', prefixo: 'SOL' }),
    categoriasServico: ['Curso regular', 'Aula particular', 'Workshop', 'Material didático', 'Matrícula'],
    servicos: [['Mensalidade curso regular', 'Curso regular', 380, 40, 8], ['Aula particular (hora)', 'Aula particular', 120, 0, 1], ['Workshop', 'Workshop', 250, 40, 4], ['Matrícula', 'Matrícula', 150, 0, 0.5], ['Apostila', 'Material didático', 90, 35, 0]],
    tiposAtivo: ['Livro', 'Apostila', 'Instrumento', 'Equipamento', 'Outro'],
    categoriasMaterial: ['Apostilas', 'Livros', 'Papelaria', 'Uniformes', 'Outros'],
    materiais: [['Apostila nível 1', 'Apostilas', 35, 90, 10], ['Livro didático', 'Livros', 60, 120, 5], ['Kit papelaria', 'Papelaria', 15, 0, 10]],
    tiposCompromisso: ['Aula', 'Reunião com responsáveis', 'Aula experimental', 'Avaliação'],
    tiposContrato: ['Mensalidade', 'Plano semestral', 'Plano anual'],
    categoriasDespesa: ['Professores', 'Material didático', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'manutencao', nome: 'Manutenção, reformas e instalações', exemplos: 'Eletricista, encanador, refrigeração, pintura, reformas, dedetização',
    rotulos: R({ ativo: 'Equipamento/local', ativos: 'Equipamentos e Locais', marca: 'Marca/modelo', serie: 'Nº de série / endereço', material: 'Material', materiais: 'Materiais', profissional: 'Técnico', turmas: 'Treinamentos' }),
    categoriasServico: ['Elétrica', 'Hidráulica', 'Refrigeração', 'Pintura', 'Reforma', 'Manutenção preventiva'],
    servicos: [['Visita técnica', 'Manutenção preventiva', 120, 30, 1], ['Instalação de ar-condicionado', 'Refrigeração', 650, 180, 4], ['Limpeza de ar-condicionado', 'Refrigeração', 220, 30, 1.5], ['Troca de disjuntor', 'Elétrica', 180, 45, 1], ['Reparo de vazamento', 'Hidráulica', 250, 40, 2], ['Pintura (m²)', 'Pintura', 35, 12, 0.3]],
    tiposAtivo: ['Ar-condicionado', 'Quadro elétrico', 'Bomba/hidráulica', 'Imóvel', 'Outro'],
    categoriasMaterial: ['Elétrica', 'Hidráulica', 'Refrigeração', 'Tintas', 'Fixação', 'Outros'],
    materiais: [['Disjuntor 20A', 'Elétrica', 18, 40, 10], ['Cabo flexível 2,5mm (m)', 'Elétrica', 3, 6, 100], ['Gás refrigerante R410A (kg)', 'Refrigeração', 85, 160, 5], ['Tubo PVC 25mm (barra)', 'Hidráulica', 22, 45, 6]],
    tiposCompromisso: ['Visita técnica', 'Execução', 'Orçamento no local', 'Reunião'],
    tiposContrato: ['Manutenção preventiva (PMOC)', 'Contrato de manutenção predial', 'Plantão de atendimento'],
    categoriasDespesa: ['Materiais', 'Transporte', 'Ferramentas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'pet', nome: 'Pet shop e veterinária', exemplos: 'Banho e tosa, clínica veterinária, hotel e creche para pets',
    rotulos: R({ ativo: 'Pet', ativos: 'Pets', marca: 'Espécie/raça', serie: 'Microchip / registro', aquisicao: 'Data de nascimento', usaGarantia: false, material: 'Produto', materiais: 'Produtos', profissional: 'Profissional', turmas: 'Cursos e Eventos', ordem: 'Atendimento', ordens: 'Atendimentos', sigla: 'atendimento', novaOrdem: 'Novo atendimento', prefixo: 'AT' }),
    categoriasServico: ['Banho e tosa', 'Consulta veterinária', 'Vacina', 'Hospedagem', 'Adestramento'],
    servicos: [['Banho (porte pequeno)', 'Banho e tosa', 60, 10, 1], ['Banho e tosa (porte médio)', 'Banho e tosa', 110, 18, 1.5], ['Consulta veterinária', 'Consulta veterinária', 180, 10, 0.75], ['Vacina V10', 'Vacina', 120, 55, 0.25], ['Diária de hospedagem', 'Hospedagem', 90, 25, 0]],
    tiposAtivo: ['Cão', 'Gato', 'Ave', 'Outro'],
    categoriasMaterial: ['Higiene', 'Medicamentos', 'Vacinas', 'Rações', 'Acessórios'],
    materiais: [['Shampoo pet (5L)', 'Higiene', 70, 0, 2], ['Vacina V10 (dose)', 'Vacinas', 55, 120, 10], ['Ração premium 15kg', 'Rações', 180, 260, 4], ['Coleira antipulgas', 'Acessórios', 45, 90, 6]],
    tiposCompromisso: ['Banho e tosa', 'Consulta', 'Vacinação', 'Busca e entrega'],
    tiposContrato: ['Plano de banhos mensal', 'Plano de saúde pet', 'Creche mensal'],
    categoriasDespesa: ['Produtos e rações', 'Medicamentos', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'consultoria', nome: 'Consultoria, agência e serviços profissionais', exemplos: 'Contabilidade, marketing, advocacia, arquitetura, RH, design',
    rotulos: R({ ativo: 'Projeto', ativos: 'Projetos', marca: 'Área', serie: 'Código do projeto', aquisicao: 'Data de início', usaGarantia: false, material: 'Recurso', materiais: 'Recursos', profissional: 'Consultor', turmas: 'Workshops', ordem: 'Entrega', ordens: 'Entregas e Demandas', sigla: 'demanda', novaOrdem: 'Nova demanda', prefixo: 'DM' }),
    categoriasServico: ['Consultoria', 'Projeto', 'Assessoria mensal', 'Diagnóstico', 'Treinamento'],
    servicos: [['Hora de consultoria', 'Consultoria', 220, 0, 1], ['Diagnóstico inicial', 'Diagnóstico', 900, 50, 6], ['Projeto sob medida', 'Projeto', 4500, 300, 30], ['Assessoria mensal', 'Assessoria mensal', 1800, 100, 12], ['Workshop in company', 'Treinamento', 2500, 200, 8]],
    tiposAtivo: ['Projeto', 'Campanha', 'Processo', 'Outro'],
    categoriasMaterial: ['Licenças', 'Material impresso', 'Brindes', 'Outros'],
    materiais: [['Licença de software (mês)', 'Licenças', 90, 0, 1], ['Material impresso', 'Material impresso', 5, 0, 50]],
    tiposCompromisso: ['Reunião', 'Entrega', 'Workshop', 'Visita ao cliente'],
    tiposContrato: ['Fee mensal', 'Assessoria contábil', 'Gestão de redes sociais', 'Retainer'],
    categoriasDespesa: ['Terceiros e freelancers', 'Software e assinaturas', 'Deslocamento', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'eventos', nome: 'Eventos e festas', exemplos: 'Buffet, decoração, fotografia, som e iluminação, espaço de festas, cerimonial',
    rotulos: R({ ativo: 'Evento', ativos: 'Eventos', marca: 'Tipo de evento', serie: 'Local', aquisicao: 'Data do evento', usaGarantia: false, material: 'Insumo', materiais: 'Insumos', profissional: 'Responsável', turmas: 'Cursos e Oficinas' }),
    categoriasServico: ['Buffet', 'Cerimonial', 'Decoração', 'Fotografia e vídeo', 'Som e iluminação', 'Locação'],
    servicos: [['Buffet (por pessoa)', 'Buffet', 85, 38, 0], ['Cerimonial completo', 'Cerimonial', 2200, 300, 10], ['Decoração completa', 'Decoração', 2800, 900, 8], ['Cobertura fotográfica', 'Fotografia e vídeo', 1800, 150, 6], ['Som e iluminação', 'Som e iluminação', 1500, 200, 6]],
    tiposAtivo: ['Casamento', 'Aniversário', 'Corporativo', 'Formatura', 'Outro'],
    categoriasMaterial: ['Alimentos', 'Bebidas', 'Descartáveis', 'Decoração', 'Equipamentos'],
    materiais: [['Farinha de trigo (kg)', 'Alimentos', 6, 0, 20], ['Refrigerante 2L', 'Bebidas', 7, 0, 24], ['Kit descartáveis (100 un.)', 'Descartáveis', 35, 0, 5], ['Toalha de mesa', 'Decoração', 25, 0, 30]],
    tiposCompromisso: ['Evento', 'Degustação', 'Visita técnica', 'Reunião'],
    tiposContrato: ['Fornecimento mensal', 'Pacote de eventos', 'Locação recorrente'],
    categoriasDespesa: ['Insumos', 'Equipe extra', 'Transporte', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'alimentacao', nome: 'Alimentação e encomendas', exemplos: 'Bolos, tortas, doces, salgados, marmitas, comida caseira, confeitaria, delivery',
    rotulos: R({ ativo: 'Preferência do cliente', ativos: 'Preferências de Clientes', marca: 'Restrição alimentar', serie: 'Endereço de entrega', aquisicao: 'Data especial (aniversário)', usaGarantia: false, material: 'Insumo', materiais: 'Insumos', profissional: 'Produção', turmas: 'Cursos e Aulas', ordem: 'Encomenda', ordens: 'Encomendas', sigla: 'encomenda', novaOrdem: 'Nova encomenda', prefixo: 'ENC', catalogo: 'Cardápio e Preços' }),
    categoriasServico: ['Bolos', 'Tortas', 'Doces', 'Salgados', 'Marmitas e refeições', 'Kits festa'],
    servicos: [
      ['Bolo de aniversário (kg)', 'Bolos', 110, 38, 2], ['Torta doce inteira', 'Tortas', 95, 32, 2], ['Torta salgada inteira', 'Tortas', 85, 30, 1.5], ['Docinhos (cento)', 'Doces', 120, 40, 3],
      ['Salgados fritos (cento)', 'Salgados', 90, 35, 3], ['Marmita (unidade)', 'Marmitas e refeições', 22, 9, 0.2], ['Kit festa 20 pessoas', 'Kits festa', 380, 140, 5],
    ],
    tiposAtivo: ['Sem restrição', 'Sem glúten', 'Sem lactose', 'Vegano', 'Diabético', 'Outro'],
    categoriasMaterial: ['Farinhas e grãos', 'Laticínios e ovos', 'Chocolates e confeitos', 'Carnes e hortifrúti', 'Embalagens'],
    materiais: [['Farinha de trigo (kg)', 'Farinhas e grãos', 6, 0, 10], ['Açúcar (kg)', 'Farinhas e grãos', 5, 0, 10], ['Leite condensado (lata)', 'Laticínios e ovos', 7, 0, 12], ['Ovos (dúzia)', 'Laticínios e ovos', 12, 0, 5], ['Chocolate nobre (kg)', 'Chocolates e confeitos', 45, 0, 2], ['Embalagem para bolo', 'Embalagens', 4, 0, 10], ['Marmitex descartável (un.)', 'Embalagens', 1.2, 0, 50]],
    tiposCompromisso: ['Produção', 'Entrega', 'Retirada', 'Degustação'],
    tiposContrato: ['Marmitas semanais', 'Fornecimento para cafeteria/loja', 'Café corporativo mensal'],
    categoriasDespesa: ['Insumos', 'Embalagens', 'Entregas e aplicativos', 'Gás e energia', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'barbearia', nome: 'Barbearia', exemplos: 'Barbearia, barber shop, clube de assinatura de corte',
    rotulos: R({ ativo: 'Ficha do cliente', ativos: 'Fichas de Clientes', marca: 'Tipo de cabelo/barba', serie: 'Corte preferido', aquisicao: 'Último atendimento', usaGarantia: false, material: 'Produto', materiais: 'Produtos', profissional: 'Barbeiro', turmas: 'Cursos', ordem: 'Atendimento', ordens: 'Atendimentos', sigla: 'atendimento', novaOrdem: 'Novo atendimento', prefixo: 'AT' }),
    categoriasServico: ['Corte', 'Barba', 'Combo', 'Química e coloração', 'Sobrancelha e estética', 'Venda de produtos'],
    servicos: [
      ['Corte masculino', 'Corte', 45, 3, 0.5], ['Barba', 'Barba', 35, 3, 0.5], ['Corte + barba', 'Combo', 70, 5, 1], ['Corte infantil', 'Corte', 35, 2, 0.5],
      ['Pigmentação', 'Química e coloração', 50, 10, 0.5], ['Platinado', 'Química e coloração', 150, 40, 2], ['Sobrancelha', 'Sobrancelha e estética', 20, 1, 0.25],
    ],
    tiposAtivo: ['Cliente avulso', 'Assinante', 'Outro'],
    categoriasMaterial: ['Finalizadores', 'Barba', 'Descartáveis', 'Química', 'Bebidas'],
    materiais: [['Pomada modeladora', 'Finalizadores', 18, 45, 6], ['Óleo para barba', 'Barba', 20, 49, 4], ['Lâminas (caixa)', 'Descartáveis', 25, 0, 3], ['Toalhas descartáveis (pct)', 'Descartáveis', 30, 0, 3], ['Descolorante (pote)', 'Química', 35, 0, 2], ['Cerveja long neck', 'Bebidas', 4, 10, 24]],
    tiposCompromisso: ['Corte', 'Barba', 'Combo', 'Bloqueio de agenda'],
    tiposContrato: ['Clube de assinatura (corte ilimitado)', 'Plano mensal corte + barba', 'Pacote de cortes'],
    categoriasDespesa: ['Produtos', 'Comissões', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'moda', nome: 'Moda e vestuário', exemplos: 'Loja de roupas, calçados, acessórios, moda íntima, ateliê de costura e ajustes',
    rotulos: R({ ativo: 'Ficha de medidas', ativos: 'Medidas e Preferências', marca: 'Estilo/preferência', serie: 'Tamanho (P/M/G/nº)', aquisicao: 'Última compra', usaGarantia: false, material: 'Produto', materiais: 'Produtos', profissional: 'Vendedor(a)', turmas: 'Eventos e Workshops', ordem: 'Pedido', ordens: 'Pedidos e Ajustes', sigla: 'pedido', novaOrdem: 'Novo pedido', prefixo: 'PED', catalogo: 'Produtos e Serviços' }),
    categoriasServico: ['Venda de roupas', 'Calçados', 'Acessórios', 'Ajustes e costura', 'Personalização', 'Consultoria de estilo'],
    servicos: [
      ['Ajuste de barra', 'Ajustes e costura', 25, 3, 0.5], ['Ajuste de cintura', 'Ajustes e costura', 40, 4, 0.75], ['Bordado/estampa personalizada', 'Personalização', 60, 15, 1],
      ['Consultoria de estilo', 'Consultoria de estilo', 250, 0, 2], ['Kit look completo', 'Venda de roupas', 320, 150, 0], ['Embalagem para presente', 'Acessórios', 10, 3, 0],
    ],
    tiposAtivo: ['Feminino', 'Masculino', 'Infantil', 'Plus size', 'Outro'],
    categoriasMaterial: ['Roupas', 'Calçados', 'Acessórios', 'Aviamentos', 'Embalagens'],
    materiais: [['Camiseta básica', 'Roupas', 25, 69.9, 10], ['Calça jeans', 'Roupas', 70, 159.9, 6], ['Vestido midi', 'Roupas', 60, 149.9, 4], ['Tênis casual', 'Calçados', 110, 229.9, 4], ['Bolsa transversal', 'Acessórios', 55, 129.9, 3], ['Linha de costura (cone)', 'Aviamentos', 8, 0, 5], ['Sacola personalizada', 'Embalagens', 1.5, 0, 50]],
    tiposCompromisso: ['Atendimento personalizado', 'Prova de ajuste', 'Retirada de pedido', 'Chegada de coleção'],
    tiposContrato: ['Clube de assinatura', 'Uniformes corporativos', 'Consignado para revendedora'],
    categoriasDespesa: ['Compra de mercadoria', 'Embalagens', 'Comissões', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'varejo', nome: 'Comércio e varejo', exemplos: 'Loja de presentes, cosméticos, papelaria, celulares e acessórios, utilidades, material de construção',
    rotulos: R({ ativo: 'Compra com garantia', ativos: 'Garantias e Trocas', marca: 'Produto', serie: 'Nº da nota / série', aquisicao: 'Data da compra', usaGarantia: true, material: 'Produto', materiais: 'Produtos', profissional: 'Vendedor(a)', turmas: 'Eventos e Workshops', ordem: 'Pedido', ordens: 'Pedidos', sigla: 'pedido', novaOrdem: 'Novo pedido', prefixo: 'PED', catalogo: 'Produtos e Serviços' }),
    categoriasServico: ['Venda balcão', 'Encomenda', 'Entrega', 'Instalação e montagem', 'Presentes'],
    servicos: [['Entrega local', 'Entrega', 15, 5, 0.5], ['Montagem/instalação', 'Instalação e montagem', 80, 0, 1], ['Encomenda especial', 'Encomenda', 50, 0, 0.5], ['Embalagem para presente', 'Presentes', 8, 2, 0.1]],
    tiposAtivo: ['Eletrônico', 'Utilidade', 'Vestuário', 'Outro'],
    categoriasMaterial: ['Mais vendidos', 'Lançamentos', 'Acessórios', 'Embalagens', 'Outros'],
    materiais: [['Produto campeão de vendas', 'Mais vendidos', 30, 69.9, 10], ['Lançamento da estação', 'Lançamentos', 45, 99.9, 5], ['Acessório complementar', 'Acessórios', 8, 24.9, 20], ['Sacola (un.)', 'Embalagens', 0.8, 0, 100]],
    tiposCompromisso: ['Entrega', 'Chegada de mercadoria', 'Atendimento agendado', 'Ação promocional'],
    tiposContrato: ['Fornecimento recorrente', 'Clube de fidelidade', 'Venda corporativa mensal'],
    categoriasDespesa: ['Compra de mercadoria', 'Embalagens', 'Fretes', 'Comissões', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'fitness', nome: 'Academia, esporte e bem-estar', exemplos: 'Academia, personal trainer, pilates, crossfit, dança, artes marciais, yoga',
    rotulos: R({ ativo: 'Avaliação física', ativos: 'Avaliações Físicas', marca: 'Objetivo', serie: 'Restrição/lesão', aquisicao: 'Data da avaliação', usaGarantia: false, material: 'Produto', materiais: 'Produtos', profissional: 'Instrutor(a)', turmas: 'Turmas e Aulas', ordem: 'Atendimento', ordens: 'Atendimentos', sigla: 'atendimento', novaOrdem: 'Novo atendimento', prefixo: 'AT' }),
    categoriasServico: ['Mensalidade', 'Personal', 'Aula avulsa', 'Pilates', 'Avaliação', 'Venda de produtos'],
    servicos: [['Mensalidade musculação', 'Mensalidade', 110, 10, 0], ['Sessão de personal', 'Personal', 120, 0, 1], ['Aula de pilates', 'Pilates', 70, 5, 1], ['Aula avulsa (diária)', 'Aula avulsa', 30, 3, 1], ['Avaliação física', 'Avaliação', 80, 0, 0.75]],
    tiposAtivo: ['Hipertrofia', 'Emagrecimento', 'Condicionamento', 'Reabilitação', 'Outro'],
    categoriasMaterial: ['Suplementos', 'Bebidas', 'Vestuário', 'Higiene e limpeza', 'Outros'],
    materiais: [['Whey protein 900g', 'Suplementos', 90, 150, 3], ['Água mineral', 'Bebidas', 1.2, 4, 24], ['Camiseta da academia', 'Vestuário', 25, 59, 5], ['Álcool 70% (L)', 'Higiene e limpeza', 12, 0, 4]],
    tiposCompromisso: ['Aula', 'Avaliação', 'Personal', 'Aula experimental'],
    tiposContrato: ['Plano mensal', 'Plano trimestral', 'Plano anual', 'Pacote de personal'],
    categoriasDespesa: ['Instrutores', 'Manutenção de equipamentos', 'Aluguel e contas', 'Marketing', 'Impostos', 'Outros'],
  },
  {
    id: 'limpeza', nome: 'Limpeza e serviços domésticos', exemplos: 'Diarista, limpeza pós-obra, higienização de estofados, lavanderia, jardinagem, piscinas',
    rotulos: R({ ativo: 'Local atendido', ativos: 'Locais Atendidos', marca: 'Tipo de imóvel', serie: 'Endereço', aquisicao: 'Primeiro atendimento', usaGarantia: false, material: 'Produto', materiais: 'Produtos', profissional: 'Equipe', turmas: 'Treinamentos' }),
    categoriasServico: ['Limpeza residencial', 'Limpeza comercial', 'Pós-obra', 'Higienização de estofados', 'Lavanderia', 'Jardinagem e piscina'],
    servicos: [['Diária residencial', 'Limpeza residencial', 220, 30, 8], ['Limpeza comercial (visita)', 'Limpeza comercial', 350, 40, 4], ['Limpeza pós-obra (m²)', 'Pós-obra', 12, 2, 0.1], ['Higienização de sofá 3 lugares', 'Higienização de estofados', 220, 25, 2], ['Lavagem de tapete (m²)', 'Lavanderia', 30, 5, 0.3], ['Manutenção de piscina', 'Jardinagem e piscina', 180, 40, 1.5]],
    tiposAtivo: ['Casa', 'Apartamento', 'Escritório', 'Comércio', 'Condomínio', 'Outro'],
    categoriasMaterial: ['Produtos de limpeza', 'Descartáveis', 'Piscina', 'Jardinagem', 'Equipamentos'],
    materiais: [['Desinfetante (5L)', 'Produtos de limpeza', 25, 0, 4], ['Detergente neutro (5L)', 'Produtos de limpeza', 20, 0, 4], ['Pano de microfibra', 'Descartáveis', 6, 0, 20], ['Saco de lixo 100L (pct)', 'Descartáveis', 30, 0, 5], ['Cloro para piscina (10kg)', 'Piscina', 160, 0, 2]],
    tiposCompromisso: ['Limpeza', 'Visita para orçamento', 'Coleta', 'Entrega'],
    tiposContrato: ['Limpeza semanal', 'Limpeza quinzenal', 'Conservação predial', 'Manutenção de piscina'],
    categoriasDespesa: ['Produtos de limpeza', 'Equipe e diárias', 'Transporte', 'Marketing', 'Impostos', 'Outros'],
  },
];

export const segmentoPorId = (id?: string) => SEGMENTOS.find((s) => s.id === id) ?? SEGMENTOS[0];

/** Perfil efetivo da empresa: preset do segmento + listas personalizadas. */
export function perfilDaEmpresa(e?: Pick<Empresa, 'segmento' | 'listas'>): PerfilNegocio {
  const base = segmentoPorId(e?.segmento);
  const listas = e?.listas ?? {};
  const out = { ...base };
  for (const { id } of LISTAS_EDITAVEIS) {
    const v = listas[id];
    if (Array.isArray(v) && v.length) (out as Record<ListaEditavel, string[]>)[id] = v;
  }
  return out;
}

/** Opções de um select garantindo que o valor atual apareça mesmo se saiu da lista. */
export const comAtual = (lista: string[], atual?: string) => (atual && !lista.includes(atual) ? [...lista, atual] : lista);

/** Adivinha o segmento de bases antigas (criadas antes desta versão) pelo catálogo de serviços. */
export function inferirSegmento(nomesServicos: string[]): string {
  const tech = new Set(SEGMENTOS.find((s) => s.id === 'tecnologia')!.servicos.map((s) => s[0]));
  return nomesServicos.some((n) => tech.has(n)) ? 'tecnologia' : 'generico';
}

/** Nome exibido do perfil de usuário: "Técnico" assume o nome do profissional do segmento. */
export const nomePerfil = (perfil: string, p: PerfilNegocio) => (perfil === 'Técnico' && p.rotulos.profissional !== 'Técnico' ? p.rotulos.profissional : perfil);

/** Nome exibido dos módulos que mudam com o segmento. */
export function rotuloModulo(id: string, padrao: string, p: PerfilNegocio) {
  if (id === 'equipamentos') return p.rotulos.ativos;
  if (id === 'estoque') return `Estoque de ${p.rotulos.materiais}`;
  if (id === 'treinamentos') return p.rotulos.turmas;
  if (id === 'ordens') return p.rotulos.ordens;
  if (id === 'servicos') return p.rotulos.catalogo;
  return padrao;
}

/** Categorias de despesa tratadas como custo variável (materiais, insumos, comissões, terceiros). */
export const ehCustoVariavel = (categoria: string) => /peç|materia|insumo|produto|comiss|laborat|terceir|equipe|ração|medicament|mercadoria|embalage|frete|entrega|instrutor/i.test(categoria);
