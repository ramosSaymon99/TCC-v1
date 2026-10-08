import type { Config, Consulta, Database, Origem, Paciente, TipoConsulta } from '../types';
import { addDays, diffDays, monthKey, parseDate, pad, today } from './format';

export type StatusPaciente = 'Novo' | 'Em acompanhamento' | 'Retorno vencido' | 'Inativo' | 'Arquivado';
export const STATUS_PACIENTE: StatusPaciente[] = ['Em acompanhamento', 'Retorno vencido', 'Novo', 'Inativo', 'Arquivado'];

/** Após este prazo sem consulta, o paciente deixa de ser "retorno vencido" e passa a "inativo". */
export const DIAS_INATIVO = 150;

export const ABERTAS = (c: Consulta) => c.status === 'Agendada' || c.status === 'Confirmada';

export interface ResumoPaciente {
  status: StatusPaciente;
  primeira?: string;
  ultima?: string;
  proxima?: Consulta;
  realizadas: number;
  faltas: number;
  receita: number;
  diasSemConsulta: number | null;
}

export function resumirPacientes(db: Database, hoje = today()): Map<string, ResumoPaciente> {
  const porPac = new Map<string, Consulta[]>();
  for (const c of db.consultas) {
    const l = porPac.get(c.pacienteId);
    if (l) l.push(c); else porPac.set(c.pacienteId, [c]);
  }
  const receitaPacote = new Map<string, number>();
  for (const p of db.pacotes) receitaPacote.set(p.pacienteId, (receitaPacote.get(p.pacienteId) ?? 0) + p.valor);

  const out = new Map<string, ResumoPaciente>();
  for (const p of db.pacientes) {
    const cs = (porPac.get(p.id) ?? []).slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    const real = cs.filter((c) => c.status === 'Realizada' && c.data <= hoje);
    const proxima = cs.find((c) => ABERTAS(c) && c.data >= hoje);
    const ultima = real[real.length - 1]?.data;
    const dias = ultima ? diffDays(hoje, ultima) : null;
    let status: StatusPaciente;
    if (p.arquivado) status = 'Arquivado';
    else if (!ultima) status = proxima ? 'Novo' : 'Inativo';
    else if (proxima || (dias ?? 0) <= db.config.retornoDias) status = 'Em acompanhamento';
    else if ((dias ?? 0) <= DIAS_INATIVO) status = 'Retorno vencido';
    else status = 'Inativo';
    out.set(p.id, {
      status, proxima, ultima, primeira: real[0]?.data,
      realizadas: real.length,
      faltas: cs.filter((c) => c.status === 'Faltou').length,
      receita: real.reduce((s, c) => s + c.valor, 0) + (receitaPacote.get(p.id) ?? 0),
      diasSemConsulta: dias,
    });
  }
  return out;
}

/* ---------- Períodos ---------- */
export const inicioMes = (iso = today()) => `${monthKey(iso)}-01`;
export const fimMes = (iso = today()) => {
  const d = parseDate(inicioMes(iso));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())}`;
};
export const mesAnterior = (iso = today()) => {
  const d = parseDate(inicioMes(iso));
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};
export const noPeriodo = (iso: string, de: string, ate: string) => iso >= de && iso <= ate;

/** Mesmo número de dias corridos no mês anterior (comparação justa no meio do mês). */
export function periodoEquivalenteAnterior(hoje = today()) {
  const de = mesAnterior(hoje);
  const dia = parseDate(hoje).getDate();
  const ate = addDays(de, Math.min(dia, parseDate(fimMes(de)).getDate()) - 1);
  return { de, ate };
}

/* ---------- Financeiro ---------- */
export type FonteReceita = TipoConsulta | 'Pacotes' | 'Outras receitas';
export const FONTES: FonteReceita[] = ['Primeira consulta', 'Retorno', 'Online', 'Bioimpedância', 'Pacotes', 'Outras receitas'];

export function faturamento(db: Database, de: string, ate: string) {
  const porFonte = Object.fromEntries(FONTES.map((f) => [f, 0])) as Record<FonteReceita, number>;
  for (const c of db.consultas) if (c.status === 'Realizada' && noPeriodo(c.data, de, ate)) porFonte[c.tipo] += c.valor;
  for (const p of db.pacotes) if (noPeriodo(p.data, de, ate)) porFonte.Pacotes += p.valor;
  for (const l of db.lancamentos) if (l.tipo === 'Receita' && noPeriodo(l.data, de, ate)) porFonte['Outras receitas'] += l.valor;
  const total = FONTES.reduce((s, f) => s + porFonte[f], 0);
  return { total, porFonte };
}

export function despesas(db: Database, de: string, ate: string) {
  const porCategoria: Record<string, number> = {};
  let total = 0;
  for (const l of db.lancamentos) {
    if (l.tipo !== 'Despesa' || !noPeriodo(l.data, de, ate)) continue;
    porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + l.valor;
    total += l.valor;
  }
  return { total, porCategoria };
}

export interface Recebivel { id: string; tipo: 'consulta' | 'pacote' | 'lancamento'; pacienteId?: string; data: string; descricao: string; valor: number }

export function aReceber(db: Database, hoje = today()): Recebivel[] {
  const out: Recebivel[] = [];
  for (const c of db.consultas) if (c.status === 'Realizada' && !c.pago && c.valor > 0 && c.data <= hoje) out.push({ id: c.id, tipo: 'consulta', pacienteId: c.pacienteId, data: c.data, descricao: c.tipo, valor: c.valor });
  for (const p of db.pacotes) if (!p.pago) out.push({ id: p.id, tipo: 'pacote', pacienteId: p.pacienteId, data: p.data, descricao: p.nome, valor: p.valor });
  for (const l of db.lancamentos) if (l.tipo === 'Receita' && !l.pago && l.data <= hoje) out.push({ id: l.id, tipo: 'lancamento', data: l.data, descricao: l.descricao, valor: l.valor });
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/* ---------- Agenda ---------- */
export function contarAtendimentos(db: Database, de: string, ate: string) {
  let realizadas = 0, faltas = 0, canceladas = 0, primeiras = 0;
  for (const c of db.consultas) {
    if (!noPeriodo(c.data, de, ate)) continue;
    if (c.status === 'Realizada') { realizadas++; if (c.tipo === 'Primeira consulta') primeiras++; }
    else if (c.status === 'Faltou') faltas++;
    else if (c.status === 'Cancelada') canceladas++;
  }
  const base = realizadas + faltas;
  return { realizadas, faltas, canceladas, primeiras, noShow: base ? faltas / base : 0 };
}

export function diasDeAtendimento(de: string, ate: string, cfg: Config) {
  let n = 0;
  for (let d = de; d <= ate; d = addDays(d, 1)) {
    const w = parseDate(d).getDay();
    if (w >= 1 && w <= cfg.diasSemana) n++;
  }
  return n;
}

/** Minutos agendados (exceto cancelados) sobre a capacidade de horas de atendimento. */
export function ocupacao(db: Database, de: string, ate: string) {
  const cap = diasDeAtendimento(de, ate, db.config) * db.config.horasDia * 60;
  const usados = db.consultas.filter((c) => c.status !== 'Cancelada' && noPeriodo(c.data, de, ate)).reduce((s, c) => s + c.duracao, 0);
  return { cap, usados, taxa: cap ? usados / cap : 0, horasLivres: Math.max(0, (cap - usados) / 60) };
}

/** Pacientes cuja 1ª consulta foi entre 45 e 210 dias atrás: quantos voltaram para ao menos um retorno. */
export function taxaRetorno(db: Database, resumo: Map<string, ResumoPaciente>, hoje = today(), filtro?: (p: Paciente) => boolean) {
  let base = 0, voltaram = 0;
  for (const p of db.pacientes) {
    if (filtro && !filtro(p)) continue;
    const r = resumo.get(p.id);
    if (!r?.primeira) continue;
    const d = diffDays(hoje, r.primeira);
    if (d < 45 || d > 210) continue;
    base++;
    if (r.realizadas >= 2) voltaram++;
  }
  return { base, voltaram, taxa: base ? voltaram / base : 0 };
}

/* ---------- Captação ---------- */
export interface CanalResumo {
  origem: Origem; novos: number; pacientes: number; receita: number; ltv: number; retorno: number;
  investimento: number; cac: number | null; roi: number | null; consultasPorPaciente: number;
}

export function porCanal(db: Database, resumo: Map<string, ResumoPaciente>, de: string, ate: string, origens: readonly Origem[]): CanalResumo[] {
  return origens.map((origem) => {
    const pacs = db.pacientes.filter((p) => p.origem === origem);
    const novos = pacs.filter((p) => noPeriodo(p.criadoEm, de, ate)).length;
    const comConsulta = pacs.filter((p) => (resumo.get(p.id)?.realizadas ?? 0) > 0);
    const receita = comConsulta.reduce((s, p) => s + (resumo.get(p.id)?.receita ?? 0), 0);
    const realizadas = comConsulta.reduce((s, p) => s + (resumo.get(p.id)?.realizadas ?? 0), 0);
    const investimento = db.lancamentos.filter((l) => l.tipo === 'Despesa' && l.canal === origem && noPeriodo(l.data, de, ate)).reduce((s, l) => s + l.valor, 0);
    const ltv = comConsulta.length ? receita / comConsulta.length : 0;
    const cac = investimento > 0 ? (novos ? investimento / novos : null) : null;
    const receitaNovos = pacs.filter((p) => noPeriodo(p.criadoEm, de, ate)).reduce((s, p) => s + (resumo.get(p.id)?.receita ?? 0), 0);
    return {
      origem, novos, pacientes: comConsulta.length, receita, ltv,
      retorno: taxaRetorno(db, resumo, today(), (p) => p.origem === origem).taxa,
      investimento, cac, roi: investimento > 0 ? (receitaNovos - investimento) / investimento : null,
      consultasPorPaciente: comConsulta.length ? realizadas / comConsulta.length : 0,
    };
  });
}

/** Mensagem pronta para WhatsApp (abre conversa com o texto preenchido). */
export function linkWhatsApp(telefone: string, texto: string) {
  const num = telefone.replace(/\D/g, '');
  const full = num.length <= 11 ? `55${num}` : num;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}

export const primeiroNome = (nome: string) => nome.split(' ')[0];
