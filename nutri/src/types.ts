export type Sexo = 'F' | 'M';

export const OBJETIVOS = ['Emagrecimento', 'Hipertrofia', 'Reeducação alimentar', 'Saúde / patologia', 'Gestação', 'Performance esportiva'] as const;
export type Objetivo = typeof OBJETIVOS[number];

export const ORIGENS = ['Instagram', 'Indicação', 'Google', 'Convênio', 'Parceria (academia/médico)', 'Outros'] as const;
export type Origem = typeof ORIGENS[number];

export const ATIVIDADES = ['Sedentário', 'Leve', 'Moderado', 'Intenso', 'Muito intenso'] as const;
export type NivelAtividade = typeof ATIVIDADES[number];

export const TIPOS_CONSULTA = ['Primeira consulta', 'Retorno', 'Online', 'Bioimpedância'] as const;
export type TipoConsulta = typeof TIPOS_CONSULTA[number];

export const STATUS_CONSULTA = ['Agendada', 'Confirmada', 'Realizada', 'Faltou', 'Cancelada'] as const;
export type StatusConsulta = typeof STATUS_CONSULTA[number];

export const FORMAS_PAGAMENTO = ['PIX', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Convênio'] as const;
export type FormaPagamento = typeof FORMAS_PAGAMENTO[number];

export const CATEGORIAS_DESPESA = ['Aluguel / sala', 'Marketing', 'Software e sistemas', 'Materiais e equipamentos', 'Impostos e taxas', 'Cursos e atualização', 'Outras'] as const;
export const CATEGORIAS_RECEITA = ['E-book / material', 'Palestra / parceria', 'Outras receitas'] as const;

export interface Anamnese {
  queixa: string;
  patologias: string;
  medicamentos: string;
  alergias: string;
  intestino: string;
  sono: string;
  aguaLitros: number;
  alcool: string;
  rotina: string;
  preferencias: string;
  aversoes: string;
}

export interface Paciente {
  id: string;
  nome: string;
  sexo: Sexo;
  nascimento: string;
  telefone: string;
  email: string;
  objetivo: Objetivo;
  origem: Origem;
  atividade: NivelAtividade;
  alturaCm: number;
  pesoMeta?: number;
  criadoEm: string;
  observacoes: string;
  arquivado?: boolean;
  anamnese: Anamnese;
}

export interface Avaliacao {
  id: string;
  pacienteId: string;
  data: string;
  peso: number;
  cintura?: number;
  quadril?: number;
  gordura?: number; // % de gordura corporal
  massaMagra?: number; // kg
  obs?: string;
}

export interface Consulta {
  id: string;
  pacienteId: string;
  data: string;
  hora: string;
  duracao: number; // minutos
  tipo: TipoConsulta;
  status: StatusConsulta;
  valor: number; // 0 quando coberta por pacote
  pago: boolean;
  forma?: FormaPagamento;
  pacoteId?: string;
  obs?: string;
}

export interface Pacote {
  id: string;
  pacienteId: string;
  nome: string;
  consultas: number;
  valor: number;
  data: string;
  pago: boolean;
  forma?: FormaPagamento;
}

export interface Lancamento {
  id: string;
  data: string;
  tipo: 'Receita' | 'Despesa';
  categoria: string;
  descricao: string;
  valor: number;
  pago: boolean;
  /** Canal de captação ao qual o gasto de marketing se refere (para CAC e ROI). */
  canal?: Origem;
}

export interface Alimento {
  id: string;
  nome: string;
  grupo: string;
  kcal: number; // por 100 g
  prot: number;
  carb: number;
  gord: number;
  fibra: number;
  medida: string; // medida caseira
  gMedida: number; // gramas da medida caseira
}

export interface ItemRefeicao { alimentoId: string; gramas: number }
export interface Refeicao { id: string; nome: string; hora: string; itens: ItemRefeicao[] }

export interface PlanoAlimentar {
  id: string;
  pacienteId: string;
  nome: string;
  criadoEm: string;
  kcalMeta: number;
  protMeta: number; // g/dia
  carbMeta: number;
  gordMeta: number;
  refeicoes: Refeicao[];
  orientacoes: string;
  ativo: boolean;
}

export interface Config {
  nome: string;
  crn: string;
  telefone: string;
  email: string;
  endereco: string;
  precos: Record<TipoConsulta, number>;
  duracoes: Record<TipoConsulta, number>;
  metaMensal: number;
  retornoDias: number;
  horasDia: number;
  diasSemana: number;
}

export interface Database {
  versao: number;
  config: Config;
  pacientes: Paciente[];
  avaliacoes: Avaliacao[];
  consultas: Consulta[];
  pacotes: Pacote[];
  lancamentos: Lancamento[];
  alimentos: Alimento[];
  planos: PlanoAlimentar[];
}
