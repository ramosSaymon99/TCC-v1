export const MIN = 60_000;
export const HORA = 60 * MIN;
export const DIA = 24 * HORA;

export const pad = (n: number) => String(n).padStart(2, '0');
export const t = (iso: string) => new Date(iso).getTime();

export function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export const addDays = (ms: number, n: number) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
export const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
export const hm = (iso: string | number) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "HH:MM" → minutos desde 00:00 */
export const minutosDoDia = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${ymd(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (s: string) => new Date(s).toISOString();

export function duracao(min: number) {
  if (!isFinite(min)) return '–';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
}
export function cronometro(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
export function haQuanto(ms: number, agora = Date.now()) {
  const d = agora - ms;
  if (d < MIN) return 'agora';
  if (d >= 2 * DIA) return `há ${Math.floor(d / DIA)} dias`;
  return `há ${duracao(d / MIN)}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const dataCurta = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${MESES[d.getMonth()]}`;
};
export const diaSemana = (ms: number) => SEMANA[new Date(ms).getDay()];
export const dataBr = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Idade em dias e texto amigável ("3 meses e 12 dias"). */
export function idade(birth: string, ref = Date.now()) {
  const b = new Date(parseYmd(birth));
  const r = new Date(ref);
  const dias = Math.floor((startOfDay(ref) - b.getTime()) / DIA);
  let meses = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
  if (r.getDate() < b.getDate()) meses--;
  const ancora = new Date(b);
  ancora.setMonth(ancora.getMonth() + meses);
  const restoDias = Math.floor((startOfDay(ref) - ancora.getTime()) / DIA);
  let texto: string;
  if (dias < 0) texto = 'ainda não nasceu';
  else if (dias < 31 && meses < 1) texto = dias === 1 ? '1 dia' : `${dias} dias`;
  else if (meses < 24) texto = `${meses} ${meses === 1 ? 'mês' : 'meses'}${restoDias ? ` e ${restoDias} ${restoDias === 1 ? 'dia' : 'dias'}` : ''}`;
  else {
    const anos = Math.floor(meses / 12);
    const m = meses % 12;
    texto = `${anos} anos${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`;
  }
  return { dias, meses, texto, semanas: Math.floor(dias / 7) };
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
