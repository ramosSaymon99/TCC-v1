/** "Completar o dia": aponta lacunas prováveis nos registros de hoje e permite registrar várias coisas de uma vez. */
import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { TIPOS } from '../lib/constants';
import { janelaReferencia } from '../lib/janela';
import { MIN, duracao, fromLocalInput, hm, idade, startOfDay, t, toLocalInput, uid } from '../lib/time';
import type { BabyEvent, EventData, EventType } from '../types';
import { Choice, Field, Sheet } from './ui';
import { pl } from '../lib/texto';

const H = 60 * MIN;
const arred5 = (ms: number) => Math.round(ms / (5 * MIN)) * 5 * MIN;

export interface Lacuna {
  id: 'fralda' | 'sono' | 'mamada';
  tipo: EventType;
  texto: string;
  /** horário sugerido (meio da lacuna) */
  quando: number;
  /** sono: término sugerido */
  ate?: number;
  data: EventData;
}

/**
 * Lacunas de hoje (só de dia, das 9h às 23h, e se a família já registrou algo hoje):
 * fralda há mais de 4 h, acordado muito além da janela de sono da idade, mamada bem além do intervalo.
 */
export function lacunasDoDia(events: BabyEvent[], birth: string, intervaloMin: number | undefined, agora: number): Lacuna[] {
  const hora = new Date(agora).getHours();
  const inicioDia = startOfDay(agora);
  if (hora < 9 || hora >= 23 || !events.some((e) => t(e.start_at) >= inicioDia)) return [];
  const ult = (f: (e: BabyEvent) => boolean) => events.filter(f).sort((a, b) => t(b.start_at) - t(a.start_at))[0];
  const dias = idade(birth, agora).dias;
  const out: Lacuna[] = [];

  // Fralda: mais de 4 h sem troca registrada (até 3 anos)
  const fr = ult((e) => e.type === 'fralda');
  if (dias < 3 * 365 && fr && agora - t(fr.start_at) > 4 * H) {
    const desde = t(fr.start_at);
    out.push({ id: 'fralda', tipo: 'fralda', texto: `Sem fralda registrada desde ${hm(desde)} (${duracao((agora - desde) / MIN)})`, quando: arred5((desde + agora) / 2), data: { diaper: 'xixi' } });
  }

  // Sono: acordado 1,5× além da janela máxima da idade sem nenhum sono registrado
  const sonos = events.filter((e) => e.type === 'sono');
  const emCurso = sonos.some((e) => !e.end_at);
  const ultSono = sonos.filter((e) => e.end_at).sort((a, b) => t(b.end_at!) - t(a.end_at!))[0];
  if (!emCurso && ultSono && dias < 3 * 365) {
    const acordou = t(ultSono.end_at!);
    const max = janelaReferencia(dias).max * MIN;
    if (agora - acordou > max * 1.5 && acordou >= inicioDia - 6 * H) {
      const ini = arred5(acordou + max);
      const fim = Math.min(arred5(ini + 45 * MIN), agora - 5 * MIN);
      if (fim > ini) out.push({ id: 'sono', tipo: 'sono', texto: `Acordado desde ${hm(acordou)} (${duracao((agora - acordou) / MIN)}), bem além da janela da idade. Teve soneca?`, quando: ini, ate: fim, data: {} });
    }
  }

  // Mamada: bem além do intervalo planejado (ou 4 h)
  const fd = ult((e) => e.type === 'mamada' || e.type === 'mamadeira');
  const limite = ((intervaloMin ?? 180) + 60) * MIN;
  if (fd && dias < 2 * 365 && agora - t(fd.start_at) > limite) {
    const desde = t(fd.start_at);
    out.push({ id: 'mamada', tipo: fd.type, texto: `Última mamada às ${hm(desde)} (${duracao((agora - desde) / MIN)})`, quando: arred5((desde + agora) / 2), data: fd.type === 'mamadeira' ? { ml: fd.data.ml, milk: fd.data.milk ?? 'materno' } : { side: fd.data.side === 'E' ? 'D' : 'E' } });
  }
  return out;
}

/** Lacuna completada ou dispensada fica oculta por 3 h (evita insistir logo depois de a pessoa agir). */
const OCULTAR_MS = 3 * 60 * MIN;
const chaveOcultar = (babyId: string) => `ninho-completar-${babyId}`;
const lerOcultos = (k: string): Record<string, number> => { try { return JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, number>; } catch { return {}; } };

/** Cartão no Hoje: aparece só quando há lacunas que a pessoa ainda não dispensou hoje. */
export function CompletarDia() {
  const { data, agora, podeEditar } = useApp();
  const { baby, events } = data;
  const k = chaveOcultar(baby.id);
  const [ocultos, setOcultos] = useState(() => lerOcultos(k));
  const [aberto, setAberto] = useState(false);
  const lacunas = useMemo(() => lacunasDoDia(events, baby.birth_date, baby.routine?.feedIntervalMin, agora), [events, baby.birth_date, baby.routine, agora]);
  const visiveis = lacunas.filter((l) => !(agora - (ocultos[l.id] ?? 0) < OCULTAR_MS));
  if (!podeEditar || baby.settings?.gestacao || !visiveis.length) return null;
  const ocultar = (quais: Lacuna['id'][]) => {
    const n = { ...ocultos, ...Object.fromEntries(quais.map((q) => [q, Date.now()])) };
    try { localStorage.setItem(k, JSON.stringify(n)); } catch { /* sem storage */ }
    setOcultos(n);
  };
  const dispensar = () => ocultar(visiveis.map((l) => l.id));
  return (
    <div className="card completar">
      <div className="card-h"><h2>📝 Completar o dia</h2><span className="faint">registros que podem ter faltado</span></div>
      <div className="stack" style={{ gap: 6 }}>
        {visiveis.map((l) => <div key={l.id} className="faint" style={{ color: 'var(--ink-2)' }}>{TIPOS[l.tipo].emoji} {l.texto}</div>)}
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn primary sm" onClick={() => setAberto(true)}>Completar agora</button>
        <button className="btn ghost sm" onClick={dispensar}>Está tudo registrado</button>
      </div>
      {aberto && <CompletarSheet lacunas={visiveis} onClose={() => setAberto(false)} onSalvo={(quais) => ocultar(quais)} />}
    </div>
  );
}

interface Linha { l: Lacuna; on: boolean; ini: string; fim: string; data: EventData }

function CompletarSheet({ lacunas, onClose, onSalvo }: { lacunas: Lacuna[]; onClose: () => void; onSalvo: (quais: Lacuna['id'][]) => void }) {
  const { data, act } = useApp();
  const [linhas, setLinhas] = useState<Linha[]>(() => lacunas.map((l) => ({ l, on: true, ini: toLocalInput(l.quando), fim: l.ate ? toLocalInput(l.ate) : '', data: l.data })));
  const [salvando, setSalvando] = useState(false);
  const mudar = (i: number, p: Partial<Linha>) => setLinhas((v) => v.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const marcadas = linhas.filter((x) => x.on);

  async function salvar() {
    const agora = Date.now();
    for (const x of marcadas) {
      const ini = Date.parse(x.ini);
      if (!(ini <= agora + 5 * MIN)) return alert(`${TIPOS[x.l.tipo].label}: o horário não pode ser no futuro.`);
      if (x.l.tipo === 'sono' && (!x.fim || Date.parse(x.fim) <= ini)) return alert('Soneca: o término precisa ser depois do início.');
    }
    setSalvando(true);
    const ids = marcadas.map(() => uid());
    const babyId = data.baby.id;
    const ok = await act(
      async () => {
        for (const [i, x] of marcadas.entries()) {
          await api.create('events', babyId, { id: ids[i], type: x.l.tipo, start_at: fromLocalInput(x.ini), end_at: x.l.tipo === 'sono' ? fromLocalInput(x.fim) : null, data: x.data, note: null });
        }
      },
      `${pl(marcadas.length, 'registro adicionado', 'registros adicionados')} ✓`,
      async () => { for (const id of ids) await api.remove('events', babyId, id); },
    );
    setSalvando(false);
    if (ok) { onSalvo(lacunas.map((l) => l.id)); onClose(); }
  }

  return (
    <Sheet title="📝 Completar o dia" onClose={onClose} footer={<button className="btn primary" disabled={salvando || !marcadas.length} onClick={salvar}>{salvando ? 'Salvando…' : `Salvar ${marcadas.length} registro(s)`}</button>}>
      <p className="faint">Os horários são uma sugestão (o meio do intervalo sem registro). Ajuste se lembrar melhor e desmarque o que não aconteceu.</p>
      {linhas.map((x, i) => (
        <div key={x.l.id} className="card" style={{ padding: 12, opacity: x.on ? 1 : 0.55 }}>
          <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={x.on} onChange={(e) => mudar(i, { on: e.target.checked })} style={{ width: 20, height: 20 }} />
            <b>{TIPOS[x.l.tipo].emoji} {x.l.tipo === 'sono' ? 'Soneca' : TIPOS[x.l.tipo].label}</b>
          </label>
          {x.on && (
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              {x.l.tipo === 'fralda' && <Choice value={x.data.diaper} onChange={(v) => mudar(i, { data: { ...x.data, diaper: v } })} options={[{ v: 'xixi', l: '💧 Xixi' }, { v: 'coco', l: '💩 Cocô' }, { v: 'ambos', l: 'Os dois' }]} />}
              {x.l.tipo === 'mamada' && <Choice value={x.data.side} onChange={(v) => mudar(i, { data: { ...x.data, side: v } })} options={[{ v: 'E', l: 'Esquerdo' }, { v: 'D', l: 'Direito' }, { v: 'ambos', l: 'Ambos' }]} />}
              {x.l.tipo === 'mamadeira' && <Field label="Quantidade (ml)"><input className="input" inputMode="numeric" value={x.data.ml ?? ''} onChange={(e) => mudar(i, { data: { ...x.data, ml: Number(e.target.value.replace(/\D/g, '')) || undefined } })} /></Field>}
              <div className={x.l.tipo === 'sono' ? 'grid g2' : ''}>
                <Field label={x.l.tipo === 'sono' ? 'Dormiu' : 'Quando'}><input className="input" type="datetime-local" value={x.ini} onChange={(e) => mudar(i, { ini: e.target.value })} /></Field>
                {x.l.tipo === 'sono' && <Field label="Acordou"><input className="input" type="datetime-local" value={x.fim} onChange={(e) => mudar(i, { fim: e.target.value })} /></Field>}
              </div>
            </div>
          )}
        </div>
      ))}
    </Sheet>
  );
}
