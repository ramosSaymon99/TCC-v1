import { Bench, Campaign, ChannelId, addDays, toISO } from './model';

type Benches = Record<ChannelId, Bench>;

export interface Preset {
  id: string;
  label: string;
  hint: string;
  build: () => Campaign;
}

const b = (cpc: number, convLead: number, leadSale: number, scale: number, cap = 0): Bench => ({ cpc, convLead, leadSale, scale, cap });

const ECOMMERCE: Benches = {
  google: b(1.2, 0.08, 0.25, 12000),
  meta: b(0.6, 0.05, 0.2, 10000),
  tiktok: b(0.4, 0.03, 0.15, 6000),
  linkedin: b(8, 0.03, 0.1, 3000),
  email: b(0.5, 0.1, 0.2, 1500, 2000), // limitado ao tamanho da base
  influencer: b(0.9, 0.04, 0.18, 8000),
};

const CURSO: Benches = {
  google: b(2.2, 0.18, 0.03, 5000),
  meta: b(0.9, 0.25, 0.02, 9000),
  tiktok: b(0.5, 0.15, 0.01, 5000),
  linkedin: b(7, 0.15, 0.02, 2000),
  email: b(0.4, 0.3, 0.04, 1000, 1500),
  influencer: b(1.2, 0.2, 0.015, 6000),
};

const B2B: Benches = {
  google: b(6, 0.07, 0.05, 8000),
  meta: b(2.5, 0.03, 0.02, 6000),
  tiktok: b(1.5, 0.01, 0.01, 3000),
  linkedin: b(9, 0.06, 0.04, 10000),
  email: b(0.8, 0.08, 0.05, 2000, 3000),
  influencer: b(4, 0.02, 0.02, 3000),
};

const today = () => toISO(new Date());

export const PRESETS: Preset[] = [
  {
    id: 'ecommerce',
    label: 'Black Friday · loja de moda',
    hint: 'Venda direta, ticket baixo, volume alto',
    build: () => {
      const start = `${new Date().getFullYear()}-11-09`;
      const s = start < today() ? addDays(today(), 7) : start;
      return {
        name: 'Black Friday Moda Urbana',
        preset: 'ecommerce',
        goal: 'lucro',
        ticket: 220,
        margin: 0.4,
        budget: 30000,
        start: s,
        end: addDays(s, 21),
        url: 'https://lojaexemplo.com.br/black-friday',
        alloc: { google: 0.35, meta: 0.35, tiktok: 0.1, linkedin: 0.05, email: 0.05, influencer: 0.1 },
        bench: structuredClone(ECOMMERCE),
      };
    },
  },
  {
    id: 'curso',
    label: 'Lançamento · curso online',
    hint: 'Captação de leads e venda no fim do lançamento',
    build: () => {
      const s = addDays(today(), 7);
      return {
        name: 'Lançamento Excel para Negócios',
        preset: 'curso',
        goal: 'lucro',
        ticket: 997,
        margin: 0.85,
        budget: 20000,
        start: s,
        end: addDays(s, 27),
        url: 'https://cursoexemplo.com.br/inscricao',
        alloc: { google: 0.2, meta: 0.4, tiktok: 0.15, linkedin: 0.1, email: 0.05, influencer: 0.1 },
        bench: structuredClone(CURSO),
      };
    },
  },
  {
    id: 'b2b',
    label: 'Geração de demanda · B2B',
    hint: 'Ticket alto, ciclo longo, foco em reuniões',
    build: () => {
      const s = addDays(today(), 7);
      return {
        name: 'Demanda ERP Indústria Q4',
        preset: 'b2b',
        goal: 'leads',
        ticket: 18000,
        margin: 0.6,
        budget: 25000,
        start: s,
        end: addDays(s, 41),
        url: 'https://softwareexemplo.com.br/demo',
        alloc: { google: 0.3, meta: 0.2, tiktok: 0.05, linkedin: 0.3, email: 0.1, influencer: 0.05 },
        bench: structuredClone(B2B),
      };
    },
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
