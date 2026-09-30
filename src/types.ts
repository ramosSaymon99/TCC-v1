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

export type CategoriaServico = 'Treinamento' | 'Manutenção' | 'Desenvolvimento Web' | 'Implantação' | 'Consultoria';

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
}

export type StatusOS = 'Aberta' | 'Em andamento' | 'Aguardando peças' | 'Finalizada' | 'Cancelada';

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
}

export type StatusEquip = 'Em uso' | 'Em manutenção' | 'Inativo';

export interface Equipamento {
  id: string;
  nome: string;
  marca: string;
  tipo: 'Notebook' | 'Computador' | 'Impressora' | 'Servidor' | 'Rede' | 'Outro';
  numeroSerie: string;
  clienteId: string;
  status: StatusEquip;
  dataAquisicao: string;
  garantiaMeses: number;
  observacoes?: string;
}

export type TipoCompromisso = 'Treinamento' | 'Manutenção' | 'Reunião' | 'Atendimento';

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
  | 'agenda' | 'financeiro' | 'relatorios' | 'usuarios' | 'configuracoes';

export interface Empresa {
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  metaMensal: number;
  diasAlertaOrcamento: number;
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
  permissoes: Record<Perfil, Modulo[]>;
  empresa: Empresa;
}
