export type TipoCliente = 'Pessoa Física' | 'Pessoa Jurídica';
export type StatusAtivo = 'Ativo' | 'Inativo';

export interface Cliente {
  id: string;
  nome: string;
  tipo: TipoCliente;
  documento: string;
  telefone: string;
  email: string;
  endereco: string;
  cidade: string;
  status: StatusAtivo;
  criadoEm: string; // ISO date
  observacoes?: string;
}

export type StatusOrcamento = 'Orçamento' | 'Em análise' | 'Proposta enviada' | 'Convertido' | 'Recusado';

export interface Orcamento {
  id: string;
  numero: string;
  clienteId: string;
  servico: string;
  categoria: CategoriaServico;
  valor: number;
  criadoEm: string;
  validade: string;
  status: StatusOrcamento;
  descricao?: string;
}

/** Categorias, tipos de ativo, de compromisso, de contrato e de material vêm do segmento da empresa (src/store/segmentos.ts). */
export type CategoriaServico = string;

export type EtapaFunil = 'Leads' | 'Em contato' | 'Proposta' | 'Negociação' | 'Fechados';

export interface Oportunidade {
  id: string;
  titulo: string; // nome do cliente/lead
  servico: string;
  valor: number;
  etapa: EtapaFunil;
  clienteId?: string;
  criadoEm: string;
  atualizadoEm: string;
  origem?: OrigemLead;   // canal que trouxe o lead (atribuição de marketing)
  postId?: string;       // post de rede social que gerou o contato, quando houver
}

export type RedeSocial = 'Instagram' | 'Facebook' | 'LinkedIn' | 'WhatsApp' | 'TikTok';
export type OrigemLead = RedeSocial | 'Google' | 'Site' | 'Indicação' | 'Cliente da base' | 'Outros';
export type FormatoPost = 'Feed' | 'Carrossel' | 'Reels' | 'Stories' | 'Vídeo' | 'Artigo' | 'Status';
export type PilarConteudo = 'Educativo' | 'Institucional' | 'Promocional' | 'Prova social' | 'Bastidores';
export type StatusPost = 'Ideia' | 'Produzindo' | 'Agendado' | 'Publicado';

export interface Post {
  id: string;
  titulo: string;
  rede: RedeSocial;
  formato: FormatoPost;
  pilar: PilarConteudo;
  categoria?: CategoriaServico; // serviço que o conteúdo divulga
  data: string;                 // data de publicação (planejada ou real)
  hora?: string;
  status: StatusPost;
  legenda?: string;
  investimento: number;         // impulsionamento pago (R$)
  // métricas (preenchidas após publicar)
  alcance: number;
  impressoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  cliques: number;
  mensagens: number;            // DMs / contatos recebidos pelo post
}

export interface Seguidores {
  id: string;
  rede: RedeSocial;
  mes: string;                  // yyyy-mm
  seguidores: number;
}

export type StatusOS = 'Aberta' | 'Em andamento' | 'Aguardando material' | 'Finalizada' | 'Cancelada';

export interface OrdemServico {
  id: string;
  numero: string;
  clienteId: string;
  servico: string;
  categoria: CategoriaServico;
  abertura: string;
  prazo: string;
  conclusao?: string;
  status: StatusOS;
  valor: number;
  equipamentoId?: string;
  tecnico?: string;
  descricao?: string;
  avaliacao?: number; // nota 0–10 dada pelo cliente após a entrega (NPS)
}

export type StatusEquip = 'Ativo' | 'Em atendimento' | 'Inativo';

export interface Equipamento {
  id: string;
  nome: string;
  marca: string;
  tipo: string;
  numeroSerie: string;
  clienteId: string;
  status: StatusEquip;
  dataAquisicao: string;
  garantiaMeses: number;
  observacoes?: string;
}

export type TipoCompromisso = string;

export interface Compromisso {
  id: string;
  titulo: string;
  tipo: TipoCompromisso;
  data: string; // yyyy-mm-dd
  inicio: string; // HH:mm
  fim: string;
  clienteId?: string;
  local?: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  data: string;
  concluida: boolean;
  prioridade: 'Alta' | 'Média' | 'Baixa';
}

export type TipoLancamento = 'Receita' | 'Despesa';
export type CategoriaDespesa = 'Peças e acessórios' | 'Transporte' | 'Marketing' | 'Software e licenças' | 'Impostos' | 'Outros';

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  descricao: string;
  categoria: string; // categoria de serviço (receita) ou de despesa
  valor: number;
  data: string;
  status: 'Pago' | 'Pendente';
  clienteId?: string;
  osId?: string;
  contratoId?: string;
  turmaId?: string;
}

export type Perfil = 'Proprietário' | 'Operador' | 'Financeiro' | 'Técnico';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  status: StatusAtivo;
  ultimoAcesso: string; // ISO datetime
}

export type Modulo =
  | 'inicio' | 'clientes' | 'orcamentos' | 'funil' | 'ordens' | 'equipamentos'
  | 'agenda' | 'financeiro' | 'relatorios' | 'usuarios' | 'configuracoes'
  | 'servicos' | 'estoque' | 'contratos' | 'treinamentos' | 'planejamento' | 'social';

export interface Servico {
  id: string;
  nome: string;
  categoria: CategoriaServico;
  preco: number;          // preço de tabela
  custo: number;          // custo direto estimado (peças, deslocamento, material)
  duracaoHoras: number;   // horas de trabalho estimadas
  descricao?: string;
  ativo: boolean;
}

export interface Peca {
  id: string;
  nome: string;
  categoria: string;
  sku: string;
  quantidade: number;
  minimo: number;
  custoUnit: number;
  precoVenda: number;
  fornecedor?: string;
}

export interface Movimento {
  id: string;
  pecaId: string;
  tipo: 'Entrada' | 'Saída';
  quantidade: number;
  data: string;
  custoUnit?: number;
  osId?: string;
  obs?: string;
}

export type TipoContrato = string;

export interface Contrato {
  id: string;
  clienteId: string;
  tipo: TipoContrato;
  descricao: string;
  valorMensal: number;
  inicio: string;
  renovacao: string;        // data de fim/renovação do contrato
  diaVencimento: number;    // dia do mês da cobrança
  status: 'Ativo' | 'Suspenso' | 'Cancelado';
  ultimaCobranca?: string;  // yyyy-mm da última cobrança gerada
}

export interface Aluno { nome: string; clienteId?: string; pago: boolean }

export interface Turma {
  id: string;
  curso: string;
  inicio: string;
  fim: string;
  horario: string;
  local: string;
  vagas: number;
  precoAluno: number;
  custoTurma: number;       // instrutor, material, sala
  status: 'Inscrições abertas' | 'Em andamento' | 'Concluída' | 'Cancelada';
  alunos: Aluno[];
}

export interface Empresa {
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  metaMensal: number;
  diasAlertaOrcamento: number;
  versaoDados?: number;
  metaPostsSemana?: number;
  /** Segmento do negócio (define categorias, catálogo inicial e nomes de telas). */
  segmento?: string;
  /** Listas personalizadas pela empresa (substituem as do segmento). */
  listas?: Partial<Record<'categoriasServico' | 'tiposAtivo' | 'categoriasMaterial' | 'tiposCompromisso' | 'tiposContrato' | 'categoriasDespesa', string[]>>;
}

export interface Database {
  clientes: Cliente[];
  orcamentos: Orcamento[];
  oportunidades: Oportunidade[];
  ordens: OrdemServico[];
  equipamentos: Equipamento[];
  compromissos: Compromisso[];
  tarefas: Tarefa[];
  lancamentos: Lancamento[];
  usuarios: Usuario[];
  servicos: Servico[];
  pecas: Peca[];
  movimentos: Movimento[];
  contratos: Contrato[];
  turmas: Turma[];
  posts: Post[];
  seguidores: Seguidores[];
  permissoes: Record<Perfil, Modulo[]>;
  empresa: Empresa;
}

/* ---------------- Plataforma SaaS (console do fornecedor) ---------------- */
export type StatusAssinatura = 'Trial' | 'Ativa' | 'Inadimplente' | 'Suspensa' | 'Cancelada';
export type CicloAssinatura = 'Mensal' | 'Anual';
export type OrigemAssinante = 'Indicação' | 'Instagram' | 'Google' | 'Parceiro contábil' | 'Evento' | 'Site' | 'Outros';

export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  precoMensal: number;
  descontoAnual: number;     // fração (0.15 = 15%) aplicada na fidelidade de 12 meses
  maxUsuarios: number;
  precoUsuarioExtra: number;
  modulos: Modulo[];
  destaque?: boolean;
  ativo: boolean;
  ordem: number;
}

export interface EventoAssinatura { data: string; tipo: string; detalhe: string }

/** Formas de pagamento do Asaas (UNDEFINED = o cliente escolhe Pix, boleto ou cartão na fatura). */
export type FormaPagamento = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD';

/** Cobrança recorrente automática no gateway (Asaas). */
export interface CobrancaAutomatica {
  provedor: 'asaas';
  ativa: boolean;
  forma: FormaPagamento;
  clienteId?: string;        // cus_...
  assinaturaId?: string;     // sub_...
  valor?: number;            // valor enviado ao Asaas (para detectar mudança de plano)
  proximoVencimento?: string;
  atualizadoEm?: string;
  erro?: string;
}

/** Uso simulado das empresas de demonstração (as reais têm o uso medido no banco). */
export interface UsoSimulado { usuarios: number; diasSemAcesso: number; modulosEmUso: number; registros: number }

export interface Assinante {
  id: string;                 // também é o identificador da base (tenant)
  empresa: string;
  cnpj: string;
  segmento: string;
  cidade: string;
  responsavel: string;
  email: string;              // login do responsável (proprietário)
  telefone: string;
  origem: OrigemAssinante;
  planoId: string;
  ciclo: CicloAssinatura;
  status: StatusAssinatura;
  inicio: string;
  trialFim?: string;
  convertidoEm?: string;
  fimFidelidade?: string;
  diaVencimento: number;
  usuariosExtras: number;
  modulosExtras: Modulo[];
  descontoPct: number;        // fração de desconto negociado
  canceladoEm?: string;
  motivoCancelamento?: string;
  valorNoCancelamento?: number;
  observacoes?: string;
  provisionado: boolean;      // tem base de dados própria (login funciona)
  usoSimulado?: UsoSimulado;
  cobranca?: CobrancaAutomatica;
  historico: EventoAssinatura[];
}

export type StatusFatura = 'Paga' | 'Em aberto' | 'Cancelada';
export interface Fatura {
  id: string;
  assinanteId: string;
  competencia: string;        // yyyy-mm
  vencimento: string;
  valor: number;
  planoId: string;
  status: StatusFatura;
  pagoEm?: string;
  asaasId?: string;           // pay_... (fatura gerada e baixada pelo Asaas)
  link?: string;              // página de pagamento do Asaas
  forma?: string;
  valorLiquido?: number;      // valor após a taxa do gateway
}

export interface ConfigPlataforma {
  id: 'geral';
  precoModuloAvulso: number;
  diasTrial: number;
  diasTolerancia: number;          // dias de atraso antes de marcar como inadimplente
  investimentoAquisicaoMes: number; // marketing + comissões por mês (para CAC)
  reguaAutomatica?: boolean;        // rotina diária marca inadimplência/suspende sozinha
}

export interface Plataforma {
  planos: Plano[];
  assinantes: Assinante[];
  faturas: Fatura[];
  config: ConfigPlataforma[];
}

/** O que o plano da empresa logada libera (calculado no servidor ou localmente). */
export interface Assinatura {
  tenant: string;
  principal: boolean;
  empresa: string;
  plano: string;
  status: StatusAssinatura;
  modulos: Modulo[];
  maxUsuarios: number;
  valorMensal: number;
  trialFim?: string;
  /** Próxima mensalidade em aberto com link de pagamento (cobrança automática). */
  faturaAberta?: { valor: number; vencimento: string; link?: string; vencida: boolean };
  forma?: FormaPagamento;
  /** Planos à venda (para a tela de upgrade). */
  ofertas?: { id: string; nome: string; precoMensal: number; maxUsuarios: number; modulos: Modulo[] }[];
}

export interface UsoTenant { usuarios: number; ultimoAcesso?: string; modulosEmUso: Modulo[]; registros: number; real: boolean }
