export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // minutos
  popular?: boolean;
}

export interface Pro {
  id: string;
  name: string;
  role: string;
  since: number;
  rating: number;
  reviews: number;
  workdays: number[]; // 0 = domingo
  initials: string;
  tone: string;
}

export interface Booking {
  id: string;
  code: string;
  serviceIds: string[];
  proId: string;
  date: string; // AAAA-MM-DD
  time: string; // HH:MM
  duration: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon?: string;
  name: string;
  phone: string;
  createdAt: string;
  status: 'confirmado' | 'cancelado';
}

export const SHOP = {
  name: 'Vértice Barbearia',
  tagline: 'Corte, barba e um café enquanto você espera.',
  address: 'Rua Augusta, 1520, Consolação, São Paulo/SP',
  whatsapp: '5511987654321',
  instagram: '@verticebarbearia',
  rating: 4.9,
  reviews: 412,
};

export const SERVICES: Service[] = [
  { id: 'corte', name: 'Corte', description: 'Tesoura ou máquina, lavagem e finalização.', price: 50, duration: 30, popular: true },
  { id: 'barba', name: 'Barba', description: 'Toalha quente, navalha e balm hidratante.', price: 40, duration: 30 },
  { id: 'combo', name: 'Corte + Barba', description: 'O combo completo, com 15% de desconto embutido.', price: 76, duration: 60, popular: true },
  { id: 'sobrancelha', name: 'Sobrancelha', description: 'Alinhamento na navalha.', price: 15, duration: 15 },
  { id: 'pigmentacao', name: 'Pigmentação de barba', description: 'Preenche falhas com acabamento natural.', price: 45, duration: 30 },
  { id: 'hidratacao', name: 'Hidratação capilar', description: 'Tratamento para cabelo ressecado.', price: 35, duration: 15 },
];

export const PROS: Pro[] = [
  { id: 'rafael', name: 'Rafael Moura', role: 'Degradê e cortes modernos', since: 2014, rating: 4.9, reviews: 186, workdays: [2, 3, 4, 5, 6], initials: 'RM', tone: '#D9A55B' },
  { id: 'bruno', name: 'Bruno Lacerda', role: 'Barba e navalha', since: 2017, rating: 4.8, reviews: 131, workdays: [2, 3, 5, 6], initials: 'BL', tone: '#8FB8A8' },
  { id: 'thiago', name: 'Thiago Reis', role: 'Cortes clássicos e tesoura', since: 2019, rating: 4.9, reviews: 95, workdays: [3, 4, 5, 6], initials: 'TR', tone: '#C98B7A' },
];

export const REVIEWS = [
  { name: 'Lucas F.', text: 'Agendei em 40 segundos pelo celular e fui atendido no horário. Raro hoje em dia.', stars: 5 },
  { name: 'Gustavo P.', text: 'O Rafael acerta o degradê toda vez. O lembrete no WhatsApp ajuda muito.', stars: 5 },
  { name: 'André M.', text: 'Barba com toalha quente vale cada centavo. Ambiente muito bom.', stars: 5 },
];

export const COUPONS: Record<string, { percent: number; label: string; firstVisitOnly: boolean }> = {
  PRIMEIRA10: { percent: 10, label: '10% na primeira visita', firstVisitOnly: true },
};

export const LOYALTY_GOAL = 10;
export const SLOT_STEP = 15;

/** Horário de funcionamento por dia da semana (minutos desde 00:00). Domingo e segunda fechado. */
export function openingHours(weekday: number): { open: number; close: number } | null {
  if (weekday === 0 || weekday === 1) return null;
  if (weekday === 6) return { open: 9 * 60, close: 18 * 60 };
  return { open: 9 * 60, close: 20 * 60 };
}

const LUNCH = { start: 12 * 60, end: 13 * 60 };
export const BOOKING_WINDOW_DAYS = 21;

// ---------- datas ----------

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const toTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function upcomingDays(count = BOOKING_WINDOW_DAYS, from = new Date()): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

// ---------- disponibilidade ----------

/** Hash determinístico para simular a ocupação de outros clientes de forma estável. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Blocos de 15 min ocupados por outros clientes (simulado): sessões de 30–60 min. */
function busyBlocks(proId: string, date: string, open: number, close: number): Set<number> {
  const busy = new Set<number>();
  const weekday = fromISODate(date).getDay();
  // sexta e sábado são mais cheios
  const load = weekday === 5 || weekday === 6 ? 0.62 : 0.4;
  for (let t = open; t < close; t += 30) {
    if (hash(`${proId}|${date}|${t}`) < load) {
      const len = hash(`${date}|${t}|${proId}|len`) < 0.35 ? 60 : 30;
      for (let b = t; b < Math.min(t + len, close); b += SLOT_STEP) busy.add(b);
    }
  }
  return busy;
}

export function isWorking(pro: Pro, date: string) {
  const wd = fromISODate(date).getDay();
  return pro.workdays.includes(wd) && openingHours(wd) !== null;
}

/** Horários de início livres para um profissional, considerando a duração total e os agendamentos do próprio usuário. */
export function freeSlots(pro: Pro, date: string, duration: number, own: Booking[], now = new Date()): string[] {
  if (!isWorking(pro, date)) return [];
  const hours = openingHours(fromISODate(date).getDay())!;
  const busy = busyBlocks(pro.id, date, hours.open, hours.close);
  for (const b of own) {
    if (b.status !== 'confirmado' || b.proId !== pro.id || b.date !== date) continue;
    const s = toMinutes(b.time);
    for (let t = s; t < s + b.duration; t += SLOT_STEP) busy.add(t);
  }
  const isToday = date === toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes() + 30; // antecedência mínima de 30 min
  const slots: string[] = [];
  for (let start = hours.open; start + duration <= hours.close; start += SLOT_STEP) {
    if (isToday && start < nowMin) continue;
    if (start < LUNCH.end && start + duration > LUNCH.start) continue;
    let ok = true;
    for (let t = start; t < start + duration; t += SLOT_STEP) {
      if (busy.has(t)) {
        ok = false;
        break;
      }
    }
    if (ok) slots.push(toTime(start));
  }
  return slots;
}

/** Quando o cliente escolhe "qualquer profissional": união dos horários e quem atende cada um. */
export function anyProSlots(date: string, duration: number, own: Booking[]): Map<string, string> {
  const map = new Map<string, string>();
  // quem está com a agenda mais vazia no dia recebe o horário primeiro, para equilibrar a carga da equipe
  const ranked = PROS.map((p) => ({ p, slots: freeSlots(p, date, duration, own) })).sort((a, b) => b.slots.length - a.slots.length);
  for (const { p, slots } of ranked) for (const s of slots) if (!map.has(s)) map.set(s, p.id);
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

// ---------- formatação ----------

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${pad(min % 60)}` : ''}`);
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const longDate = (iso: string) =>
  fromISODate(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
export const formatPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id)!;
export const proById = (id: string) => PROS.find((p) => p.id === id)!;

export function isPast(b: Booking, now = new Date()) {
  const d = fromISODate(b.date);
  d.setMinutes(toMinutes(b.time) + b.duration);
  return d < now;
}
