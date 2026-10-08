import type { EventType } from '../types';

export const PAPEIS: { id: string; label: string; emoji: string }[] = [
  { id: 'mae', label: 'Mãe', emoji: '👩' },
  { id: 'pai', label: 'Pai', emoji: '👨' },
  { id: 'avo_f', label: 'Avó', emoji: '👵' },
  { id: 'avo_m', label: 'Avô', emoji: '👴' },
  { id: 'baba', label: 'Babá', emoji: '🧑‍🍼' },
  { id: 'tia', label: 'Tia', emoji: '👩‍🦰' },
  { id: 'tio', label: 'Tio', emoji: '👨‍🦱' },
  { id: 'irma', label: 'Irmã', emoji: '👧' },
  { id: 'irmao', label: 'Irmão', emoji: '👦' },
  { id: 'madrinha', label: 'Madrinha', emoji: '💐' },
  { id: 'padrinho', label: 'Padrinho', emoji: '🎩' },
  { id: 'outro', label: 'Outro cuidador', emoji: '🤝' },
];
export const papel = (id?: string) => PAPEIS.find((p) => p.id === id) ?? PAPEIS[PAPEIS.length - 1];

export const ACESSOS = {
  admin: { label: 'Administrador', desc: 'Edita o bebê, convida e remove cuidadores' },
  editor: { label: 'Cuidador', desc: 'Registra rotina, mural, recados e saúde' },
  leitor: { label: 'Acompanha', desc: 'Só visualiza os registros e indicadores' },
} as const;

export const TIPOS: Record<EventType, { label: string; emoji: string; cor: string }> = {
  mamada: { label: 'Amamentação', emoji: '🤱', cor: '#E0708A' },
  mamadeira: { label: 'Mamadeira', emoji: '🍼', cor: '#EE9B4A' },
  sono: { label: 'Sono', emoji: '😴', cor: '#6B78D6' },
  fralda: { label: 'Fralda', emoji: '🧷', cor: '#2FA391' },
  remedio: { label: 'Remédio', emoji: '💊', cor: '#D2524E' },
  banho: { label: 'Banho', emoji: '🛁', cor: '#3EA6D1' },
  alimentacao: { label: 'Papinha', emoji: '🥣', cor: '#74AE4F' },
  extracao: { label: 'Extração', emoji: '🥛', cor: '#B57BD0' },
  outro: { label: 'Outro', emoji: '📝', cor: '#8A8F98' },
};
export const COR_COCO = '#A0713F';

export const CORES_BEBE = ['#E0708A', '#6B78D6', '#2FA391', '#EE9B4A', '#B57BD0', '#3EA6D1'];

export const CATEGORIAS_MURAL = ['Fraldas e higiene', 'Alimentação', 'Saúde e remédios', 'Banho', 'Roupas', 'Passeio e quarto', 'Outros'];

/** Calendário Nacional de Vacinação (PNI) – criança, simplificado. Idade de referência em meses. */
export const VACINAS: { code: string; nome: string; meses: number }[] = [
  { code: 'bcg', nome: 'BCG', meses: 0 },
  { code: 'hepb_0', nome: 'Hepatite B (ao nascer)', meses: 0 },
  { code: 'penta_1', nome: 'Pentavalente – 1ª dose', meses: 2 },
  { code: 'vip_1', nome: 'VIP (poliomielite) – 1ª dose', meses: 2 },
  { code: 'pneumo_1', nome: 'Pneumocócica 10V – 1ª dose', meses: 2 },
  { code: 'rota_1', nome: 'Rotavírus – 1ª dose', meses: 2 },
  { code: 'menc_1', nome: 'Meningocócica C – 1ª dose', meses: 3 },
  { code: 'penta_2', nome: 'Pentavalente – 2ª dose', meses: 4 },
  { code: 'vip_2', nome: 'VIP (poliomielite) – 2ª dose', meses: 4 },
  { code: 'pneumo_2', nome: 'Pneumocócica 10V – 2ª dose', meses: 4 },
  { code: 'rota_2', nome: 'Rotavírus – 2ª dose', meses: 4 },
  { code: 'menc_2', nome: 'Meningocócica C – 2ª dose', meses: 5 },
  { code: 'penta_3', nome: 'Pentavalente – 3ª dose', meses: 6 },
  { code: 'vip_3', nome: 'VIP (poliomielite) – 3ª dose', meses: 6 },
  { code: 'gripe_1', nome: 'Influenza (gripe) – 1ª dose', meses: 6 },
  { code: 'covid_1', nome: 'Covid-19 – 1ª dose', meses: 6 },
  { code: 'fa_1', nome: 'Febre amarela – 1ª dose', meses: 9 },
  { code: 'triplice_1', nome: 'Tríplice viral – 1ª dose', meses: 12 },
  { code: 'pneumo_r', nome: 'Pneumocócica 10V – reforço', meses: 12 },
  { code: 'menacwy', nome: 'Meningocócica ACWY – reforço', meses: 12 },
  { code: 'dtp_r1', nome: 'DTP – 1º reforço', meses: 15 },
  { code: 'vip_r', nome: 'Poliomielite – reforço', meses: 15 },
  { code: 'hepa', nome: 'Hepatite A', meses: 15 },
  { code: 'tetra', nome: 'Tetraviral (sarampo, caxumba, rubéola, varicela)', meses: 15 },
  { code: 'dtp_r2', nome: 'DTP – 2º reforço', meses: 48 },
  { code: 'fa_r', nome: 'Febre amarela – reforço', meses: 48 },
  { code: 'varicela_2', nome: 'Varicela – 2ª dose', meses: 48 },
];
