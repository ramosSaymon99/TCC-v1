export type Access = 'admin' | 'editor' | 'leitor';
export type EventType = 'mamada' | 'mamadeira' | 'sono' | 'fralda' | 'remedio' | 'banho' | 'alimentacao' | 'extracao' | 'outro';

export interface Routine {
  wake?: string;
  bedtime?: string;
  feeds: string[];
  naps: string[];
  feedIntervalMin?: number;
}

export interface User { id: string; name: string; email: string; photo?: string | null; demo?: boolean; created_at?: string }

export interface Baby {
  id: string;
  name: string;
  birth_date: string;
  sex?: 'F' | 'M' | null;
  color?: string | null;
  routine?: Routine | null;
  notes?: string | null;
  photo?: string | null;
  created_by?: string;
  role?: string;
  access?: Access;
}

export interface Member { user_id: string; role: string; access: Access; name: string; email: string; created_at: string; photo?: string | null }

export interface EventData {
  side?: 'E' | 'D' | 'ambos';
  ml?: number;
  milk?: 'materno' | 'formula';
  diaper?: 'xixi' | 'coco' | 'ambos' | 'seca';
  consistency?: string;
  color?: string;
  med?: string;
  dose?: string;
  food?: string;
  acceptance?: 'boa' | 'media' | 'recusou';
  quality?: 'tranquilo' | 'agitado';
}

export interface BabyEvent {
  id: string;
  baby_id?: string;
  type: EventType;
  start_at: string;
  end_at?: string | null;
  data: EventData;
  note?: string | null;
  user_id: string;
  created_at?: string;
}

export interface Growth { id: string; date: string; weight_g?: number | null; height_cm?: number | null; head_cm?: number | null; source?: string | null; note?: string | null; user_id: string }
export interface Supply {
  id: string; name: string; category?: string | null; unit?: string | null; qty: number; min_qty: number;
  auto_type?: string | null; per_use?: number | null; buyer_id?: string | null; note?: string | null; user_id: string; updated_at?: string;
}
export interface Note { id: string; text: string; pinned: number; done: number; user_id: string; created_at: string }
export interface Appointment { id: string; date: string; title: string; doctor?: string | null; note?: string | null; done: number; user_id: string }
export interface Vaccine { code: string; date: string; user_id: string }

export interface BabyData {
  baby: Baby;
  members: Member[];
  events: BabyEvent[];
  growth: Growth[];
  supplies: Supply[];
  notes: Note[];
  appointments: Appointment[];
  vaccines: Vaccine[];
  access: Access;
  role: string;
}

export type Resource = 'events' | 'growth' | 'supplies' | 'notes' | 'appointments';

export interface NotifPrefs {
  atividade: boolean;
  recados: boolean;
  lembretes: boolean;
  estoque: boolean;
  consultas: boolean;
  familia: boolean;
  cronometro: boolean;
  silencio: { on: boolean; de: string; ate: string };
}
