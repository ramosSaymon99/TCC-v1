/** Ciclo do sono: mostrador de 24 h com os sonos registrados, a próxima soneca prevista e a hora de dormir. */
import { useMemo } from 'react';
import { Moon, Sun } from 'lucide-react';
import { BotoesRegistro, LinhaDoTempo, RotinaPlanejada } from '../components/RotinaDia';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { proximaSoneca } from '../lib/janela';
import { DIA, MIN, duracao, hm, idade, startOfDay, t, uid } from '../lib/time';
import { pl } from '../lib/texto';
import { TIPOS } from '../lib/constants';
import type { BabyEvent, EventType } from '../types';

const C = 160; // centro do mostrador (viewBox 320×320)
const R = 122; // raio da trilha
const H = 60 * MIN;

/** Ângulo no mostrador: meio-dia no topo, 18h à direita, meia-noite embaixo, 6h à esquerda. */
const angulo = (ms: number) => { const d = new Date(ms); return (((d.getHours() + d.getMinutes() / 60 - 12) / 24) * 360 + 360) % 360; };
const ponto = (graus: number, r: number) => { const a = (graus * Math.PI) / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)] as const; };
function arco(ini: number, fim: number, r = R) {
  const a1 = angulo(ini);
  let delta = ((fim - ini) / DIA) * 360;
  if (delta >= 359.5) delta = 359.5;
  const a2 = a1 + delta;
  const [x1, y1] = ponto(a1, r);
  const [x2, y2] = ponto(a2, r);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${delta > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
const hhmmHoje = (hhmm: string | undefined, base: number) => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return startOfDay(base) + h * H + m * MIN;
};
/** Registros mostrados em volta do mostrador. */
const NO_MOSTRADOR: EventType[] = ['mamada', 'mamadeira', 'fralda', 'alimentacao'];
const R_ICONE = R + 25; // borda externa, fora da trilha do sono
const SEP = 9; // graus mínimos entre dois ícones

/** Posição dos ícones: cada um no seu horário; muito próximos são empurrados alguns graus (até 2 casas). */
function posicionarIcones(evs: BabyEvent[]) {
  const out: { e: BabyEvent; graus: number }[] = [];
  let ocultos = 0;
  let ultimo = -Infinity;
  let ultimoReal = -Infinity;
  for (const e of [...evs].sort((a, b) => t(a.start_at) - t(b.start_at))) {
    const real = angulo(t(e.start_at));
    // ângulo contínuo a partir do primeiro (evita salto 359° → 0°)
    let g = real;
    while (out.length && g < ultimoReal - 180) g += 360;
    ultimoReal = g;
    const pos = Math.max(g, ultimo + SEP);
    if (pos - g > 2 * SEP) { ocultos++; continue; }
    out.push({ e, graus: pos % 360 });
    ultimo = pos;
  }
  return { icones: out, ocultos };
}
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function CicloSono() {
  const { data, agora, act, podeEditar } = useApp();
  const { baby, events } = data;
  const primeiro = baby.name.split(' ')[0];
  const id = idade(baby.birth_date, agora);

  const c = useMemo(() => {
    const sonos = events.filter((e) => e.type === 'sono');
    const emCurso = sonos.find((e) => !e.end_at) ?? null;
    // Sonos das últimas 20 h (o mostrador cobre 24 h; o resto fica para as previsões)
    const desde = agora - 20 * H;
    const passados = sonos.filter((e) => (e.end_at ? t(e.end_at) : agora) > desde).map((e) => ({ e, ini: Math.max(t(e.start_at), desde), fim: e.end_at ? t(e.end_at) : agora }));
    const ehNoturno = (ini: number, fim: number) => fim - ini >= 4 * H || [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5].includes(new Date(ini).getHours());
    // Duração típica de soneca (últimos 7 dias) para desenhar as previstas
    const sonecas = sonos.filter((e) => e.end_at && t(e.start_at) > agora - 7 * DIA && t(e.end_at) - t(e.start_at) < 4 * H).map((e) => (t(e.end_at!) - t(e.start_at)) / MIN);
    const durSoneca = Math.max(30, Math.min(120, mediana(sonecas) || 45)) * MIN;
    const prox = proximaSoneca(id.dias, sonos, agora);
    // Hora de dormir e de acordar: da rotina planejada
    let dorme = hhmmHoje(baby.routine?.bedtime, agora);
    if (dorme && dorme < agora - 2 * H) dorme += DIA;
    let acorda = hhmmHoje(baby.routine?.wake, agora);
    if (acorda && acorda < agora) acorda += DIA;
    // Sonecas previstas: a próxima pela janela de sono e as seguintes pela rotina, antes de dormir
    const previstas: { ini: number; fim: number }[] = [];
    if (prox && (!dorme || prox.ini < dorme - 30 * MIN)) previstas.push({ ini: Math.max(prox.ini, agora), fim: Math.max(prox.ini, agora) + durSoneca });
    for (const n of baby.routine?.naps ?? []) {
      const ini = hhmmHoje(n, agora);
      if (!ini || ini <= (previstas[previstas.length - 1]?.fim ?? agora) + 60 * MIN) continue;
      if (dorme && ini >= dorme - 30 * MIN) continue;
      previstas.push({ ini, fim: ini + durSoneca });
    }
    // Aprendizado: dias com sono registrado nos últimos 7
    const dias = new Set(sonos.filter((e) => t(e.start_at) > agora - 7 * DIA).map((e) => startOfDay(t(e.start_at)))).size;
    const hoje = startOfDay(agora);
    const sonoHojeMin = sonos.reduce((s, e) => { const i = Math.max(t(e.start_at), hoje); const f = e.end_at ? t(e.end_at) : agora; return f > i ? s + (f - i) / MIN : s; }, 0);
    const sonecasHoje = sonos.filter((e) => t(e.start_at) >= hoje && !ehNoturno(t(e.start_at), e.end_at ? t(e.end_at) : agora)).length;
    const ultAcordou = sonos.filter((e) => e.end_at).sort((a, b) => t(b.end_at!) - t(a.end_at!))[0];
    const registros = posicionarIcones(events.filter((e) => NO_MOSTRADOR.includes(e.type) && t(e.start_at) > desde && t(e.start_at) <= agora));
    return { emCurso, passados, ehNoturno, prox, previstas, dorme, acorda, dias, sonoHojeMin, sonecasHoje, ultAcordou, registros };
  }, [events, agora, baby.routine, id.dias]);

  // Mensagem central
  let rotulo = 'Registre um sono para começar';
  let grande = '—';
  let apoio = '';
  if (c.emCurso) {
    rotulo = `${primeiro} está dormindo`;
    grande = duracao((agora - t(c.emCurso.start_at)) / MIN);
    apoio = `desde ${hm(c.emCurso.start_at)}`;
  } else if (c.dorme && agora >= c.dorme - 20 * MIN && agora < c.dorme + 3 * H) {
    rotulo = 'Hora de dormir';
    grande = `~${hm(c.dorme)}`;
    apoio = 'pela rotina planejada';
  } else if (c.prox) {
    if (agora < c.prox.ini) {
      const falta = (c.prox.ini - agora) / MIN;
      rotulo = c.sonecasHoje ? 'Próxima soneca em' : 'Primeira soneca em';
      grande = falta < 60 ? `${Math.round(falta)} min` : duracao(falta);
      apoio = `janela ${hm(c.prox.ini)}–${hm(c.prox.fim)}`;
    } else if (agora <= c.prox.fim) {
      rotulo = 'Janela de sono aberta';
      grande = 'agora';
      apoio = `bom momento até ${hm(c.prox.fim)}`;
    } else {
      rotulo = 'Passou da janela';
      grande = duracao(c.prox.acordadoMin);
      apoio = 'acordado: sinais de cansaço? hora de dormir';
    }
  }

  const dormir = () => act(async () => { await api.create('events', baby.id, { id: uid(), type: 'sono', start_at: new Date().toISOString(), end_at: null, data: {} }); }, 'Bom sono 😴');
  const acordou = (e: BabyEvent) => act(() => api.update('events', baby.id, e.id, { end_at: new Date().toISOString() }), `Acordou: dormiu ${duracao((Date.now() - t(e.start_at)) / MIN)}`, () => api.update('events', baby.id, e.id, { end_at: null }));
  const pct = Math.round((Math.min(c.dias, 7) / 7) * 100);
  const [ax, ay] = ponto(angulo(agora), R);
  const marcador = (ms: number | null, Icone: typeof Sun, cor: string, chave: string) => {
    if (!ms) return null;
    const [x, y] = ponto(angulo(ms), R);
    return (
      <g key={chave}>
        <circle cx={x} cy={y} r={15} fill="#1d1b3d" stroke={cor} strokeWidth={2} />
        <foreignObject x={x - 9} y={y - 9} width={18} height={18}><Icone size={18} color={cor} /></foreignObject>
      </g>
    );
  };
  const horas = [0, 6, 12, 18];

  return (
    <div className="page ciclo-pagina">
      <div><h1>Rotina de {primeiro}</h1><p className="faint">Sono, mamadas, fraldas e tudo do dia num lugar só: marque aqui e a família vê na hora.</p></div>
      <div className="ciclo">
        <div className="between">
          <span className="ciclo-titulo">🌙 Ciclo do sono</span>
          <span className="ciclo-titulo" style={{ fontWeight: 600, fontSize: 13 }}>{new Date(agora).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</span>
        </div>

        <div className="ciclo-dial">
          <svg viewBox="0 0 320 320" role="img" aria-label={`Ciclo do sono de ${primeiro}: ${rotulo} ${grande}`}>
            <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={26} />
            {horas.map((h) => {
              const [x, y] = ponto(((h - 12) / 24) * 360, R - 25);
              return <text key={h} x={x} y={y + 4} textAnchor="middle" className="ciclo-hora">{String(h).padStart(2, '0')}h</text>;
            })}
            {/* Sonos registrados */}
            {c.passados.map(({ e, ini, fim }) => (
              <path key={e.id} d={arco(ini, fim)} fill="none" stroke={c.ehNoturno(ini, fim) ? '#7c74e8' : '#a9a2ff'} strokeWidth={22} strokeLinecap="round" opacity={e.end_at ? 0.95 : 1}>
                <title>{`Sono ${hm(ini)}–${e.end_at ? hm(fim) : 'agora'}`}</title>
              </path>
            ))}
            {/* Janela da próxima soneca e sonecas previstas */}
            {c.prox && !c.emCurso && c.prox.fim > agora && <path d={arco(Math.max(c.prox.ini, agora), c.prox.fim, R + 17)} fill="none" stroke="#f5c96a" strokeWidth={3} strokeLinecap="round" opacity={0.85} />}
            {!c.emCurso && c.previstas.map((p, i) => (
              <path key={i} d={arco(p.ini, p.fim)} fill="none" stroke="#c9c4ff" strokeWidth={22} strokeLinecap="round" strokeDasharray="3 5" opacity={0.75}>
                <title>{`Soneca prevista ~${hm(p.ini)}`}</title>
              </path>
            ))}
            {/* Mamadas, fraldas e papinhas registradas, na borda externa */}
            {c.registros.icones.map(({ e, graus }) => {
              const [x, y] = ponto(graus, R_ICONE);
              const emoji = e.type === 'fralda' && (e.data.diaper === 'coco' || e.data.diaper === 'ambos') ? '💩' : TIPOS[e.type].emoji;
              return (
                <g key={e.id} className="ciclo-icone">
                  <title>{`${TIPOS[e.type].label} às ${hm(e.start_at)}`}</title>
                  <circle cx={x} cy={y} r={11} fill="#2e2a62" stroke="rgba(255,255,255,.18)" />
                  <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12">{emoji}</text>
                </g>
              );
            })}
            {marcador(c.acorda, Sun, '#f5c96a', 'acorda')}
            {marcador(c.dorme, Moon, '#f2a46b', 'dorme')}
            {/* Agora */}
            <circle cx={ax} cy={ay} r={7} fill="#fff" stroke="#1d1b3d" strokeWidth={3} />
          </svg>
          <div className="ciclo-centro">
            <span className="ciclo-rotulo">{rotulo}</span>
            <span className="ciclo-grande">{grande}</span>
            {apoio && <span className="ciclo-apoio">{apoio}</span>}
          </div>
        </div>

        <div className="ciclo-marcos">
          <div><Sun size={18} color="#f5c96a" /><b>{c.ultAcordou ? hm(c.ultAcordou.end_at!) : '—'}</b><span>acordou</span></div>
          <div><span className="ciclo-emoji">😴</span><b>{c.sonecasHoje}</b><span>{c.sonecasHoje === 1 ? 'soneca hoje' : 'sonecas hoje'}</span></div>
          <div><span className="ciclo-emoji">⏱️</span><b>{duracao(c.sonoHojeMin)}</b><span>de sono hoje</span></div>
          <div><Moon size={18} color="#f2a46b" /><b>{c.dorme ? `~${hm(c.dorme)}` : '—'}</b><span>dormir</span></div>
        </div>

        {podeEditar && (
          c.emCurso
            ? <button className="ciclo-acao" onClick={() => acordou(c.emCurso!)}><Sun size={20} /> Acordou agora</button>
            : <button className="ciclo-acao" onClick={dormir}><Moon size={20} /> Dormiu agora</button>
        )}

        <div className="ciclo-aprendendo">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="#a9a2ff" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 113} 113`} transform="rotate(-90 22 22)" />
            <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">{pct}%</text>
          </svg>
          <div>
            <b>{pct >= 100 ? `O Ninho já conhece o ritmo de ${primeiro}` : `O Ninho está aprendendo o ritmo de ${primeiro}`}</b>
            <span>{pct >= 100 ? 'Previsões pelos horários reais dos últimos 7 dias.' : `${pl(c.dias, 'dia', 'dias')} com sono registrado de 7. Quanto mais sonos registrados, mais certeiras as previsões.`}</span>
          </div>
        </div>

        <div className="ciclo-legenda">
          <span><i style={{ background: '#7c74e8' }} /> sono da noite</span>
          <span><i style={{ background: '#a9a2ff' }} /> soneca</span>
          <span><i className="tracejado" /> prevista</span>
          <span><i style={{ background: '#f5c96a', height: 3 }} /> janela ideal</span>
          <span>{TIPOS.mamada.emoji}{TIPOS.mamadeira.emoji} mamada · {TIPOS.fralda.emoji} fralda · {TIPOS.alimentacao.emoji} papinha{c.registros.ocultos ? ` · +${c.registros.ocultos} juntos` : ''}</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <h3 className="titulo-bloco">Marcar agora</h3>
        <BotoesRegistro />
      </div>
      <RotinaPlanejada />
      <LinhaDoTempo />
    </div>
  );
}
