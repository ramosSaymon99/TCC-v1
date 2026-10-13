import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Moon, Pin, RotateCcw, Sun } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { TIPOS, papel } from '../lib/constants';
import { aderencia, estatisticas, insights, mediaDiaria } from '../lib/metrics';
import { DIA, MIN, addDays, cronometro, dataCurta, diaSemana, duracao, haQuanto, hm, idade, startOfDay, t } from '../lib/time';
import type { BabyEvent, EventType } from '../types';
import { Delta, Empty } from '../components/ui';
import { InsightList } from '../components/Insights';
import { Avatar } from '../components/Avatar';
import { proximaSoneca } from '../lib/janela';
import { doses, ehMadrugada, proximaMamada, resumoDesde, resumoNoite, sugestoesRepetir } from '../lib/previsao';
import { dicaDaSemana } from '../lib/conteudo';
import { uid, ymd } from '../lib/time';
import { sugerirRotina } from '../lib/rotina';
import { idCheck } from '../lib/conteudo';
import { SugestaoRotinaSheet } from './Familia';
import { Sheet } from '../components/ui';
import { Ajuda, DicaUnica, PrimeirosPassos, Secao } from '../components/Guia';
import type { ItemRotina } from '../lib/metrics';

const RAPIDOS: EventType[] = ['mamada', 'mamadeira', 'sono', 'fralda', 'remedio', 'saude', 'banho', 'alimentacao'];
const LS_VISITA = (u: string, b: string) => `ninho-visita-${u}-${b}`;

export function descreve(e: BabyEvent, agora: number) {
  const dur = e.end_at ? (t(e.end_at) - t(e.start_at)) / MIN : (agora - t(e.start_at)) / MIN;
  switch (e.type) {
    case 'mamada': return `${e.data.side === 'E' ? 'Peito esquerdo' : e.data.side === 'D' ? 'Peito direito' : 'Ambos os peitos'} · ${duracao(dur)}${e.end_at ? '' : ' (em andamento)'}`;
    case 'mamadeira': return `${e.data.ml ? `${e.data.ml} ml` : 'Mamadeira'} · ${e.data.milk === 'formula' ? 'fórmula' : 'leite materno'}`;
    case 'sono': return `${e.end_at ? `Dormiu ${duracao(dur)} (até ${hm(e.end_at)})` : `Dormindo há ${duracao(dur)}`}${e.data.quality === 'agitado' ? ' · agitado' : ''}`;
    case 'fralda': return ({ xixi: 'Xixi', coco: 'Cocô', ambos: 'Xixi + cocô', seca: 'Seca' } as Record<string, string>)[e.data.diaper ?? 'xixi'] + (e.data.consistency ? ` · ${e.data.consistency}` : '') + (e.data.color ? `, ${e.data.color}` : '');
    case 'remedio': return `${e.data.med ?? 'Remédio'}${e.data.dose ? ` · ${e.data.dose}` : ''}`;
    case 'alimentacao': return `${e.data.food ?? 'Alimentação'}${e.data.acceptance ? ` · aceitação ${e.data.acceptance}` : ''}`;
    case 'extracao': return `${e.data.ml ?? '?'} ml extraídos${e.data.guardar && e.data.guardar !== 'usado' ? ` · ${e.data.guardar}` : ''}`;
    case 'saude': return [e.data.temp != null ? `${String(e.data.temp).replace('.', ',')} °C` : '', ...(e.data.sintomas ?? [])].filter(Boolean).join(' · ') || 'Registro de saúde';
    case 'banho': return 'Banho';
    default: return e.note ?? 'Registro';
  }
}

export function Hoje() {
  const app = useApp();
  const { data, agora, user, abrirRegistro, act, podeEditar, nome, setAba } = app;
  const { baby, events } = data;
  const [diaSel, setDiaSel] = useState(startOfDay(agora));
  const hoje = startOfDay(agora);
  const id = idade(baby.birth_date, agora);
  const meuPapel = papel(data.role);

  const ativos = events.filter((e) => !e.end_at && (e.type === 'sono' || e.type === 'mamada'));
  const ultimo = (f: (e: BabyEvent) => boolean) => events.filter(f).sort((a, b) => t(b.start_at) - t(a.start_at))[0];
  const ultFeed = ultimo((e) => e.type === 'mamada' || e.type === 'mamadeira');
  const ultFralda = ultimo((e) => e.type === 'fralda');
  const ultSono = ultimo((e) => e.type === 'sono');
  const dormindo = ultSono && !ultSono.end_at;

  // Hoje até agora × média dos 7 dias anteriores no mesmo horário (base equivalente)
  const { hj, base } = useMemo(() => {
    const dec = agora - hoje;
    const hj = estatisticas(events, hoje, agora, baby.routine, agora);
    const base = mediaDiaria([1, 2, 3, 4, 5, 6, 7].map((i) => estatisticas(events, addDays(hoje, -i), addDays(hoje, -i) + dec, baby.routine, agora)));
    return { hj, base };
  }, [events, agora, hoje, baby.routine]);

  const rotina = aderencia(events, baby.routine, hoje, agora, data.checks);
  const mobile = typeof window !== 'undefined' && window.innerWidth < 900;
  const semHistorico = !events.some((e) => t(e.start_at) >= addDays(hoje, -7));
  const [itemRotina, setItemRotina] = useState<ItemRotina | null>(null);
  const [verSugestao, setVerSugestao] = useState(false);
  const sugestao = useMemo(() => sugerirRotina(events, baby.routine, baby.birth_date, agora), [events, baby.routine, baby.birth_date, agora]);
  const lista = useMemo(() => insights(data, agora), [data, agora]);
  const doDia = events.filter((e) => t(e.start_at) >= diaSel && t(e.start_at) < addDays(diaSel, 1)).sort((a, b) => t(b.start_at) - t(a.start_at));
  const meusHoje = events.filter((e) => e.user_id === user.id && t(e.start_at) >= hoje).length;
  const fixados = data.notes.filter((n) => n.pinned && !n.done && n.kind !== 'pergunta').slice(0, 3);

  // Passagem de turno: lembra quando esta pessoa abriu o app pela última vez (neste aparelho)
  const [visita] = useState(() => { try { const v = localStorage.getItem(LS_VISITA(user.id, baby.id)); return v ? Number(v) : null; } catch { return null; } });
  useEffect(() => {
    const gravar = () => { try { localStorage.setItem(LS_VISITA(user.id, baby.id), String(Date.now())); } catch { /* sem storage */ } };
    const vis = () => document.visibilityState === 'hidden' && gravar();
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); gravar(); };
  }, [user.id, baby.id]);
  const chegada = visita && agora - visita > 60 * MIN ? resumoDesde(data, visita, user.id, agora) : null;

  const soneca = useMemo(() => proximaSoneca(id.dias, events.filter((e) => e.type === 'sono'), agora), [events, id.dias, agora]);
  const mamadaPrev = useMemo(() => proximaMamada(events, agora), [events, agora]);
  const listaDoses = useMemo(() => doses(events, agora), [events, agora]);
  const noiteRes = useMemo(() => (new Date(agora).getHours() < 14 ? resumoNoite(events, baby.routine, agora) : null), [events, baby.routine, agora]);
  const repetir = useMemo(() => sugestoesRepetir(events), [events]);
  const dica = dicaDaSemana(id.semanas);
  const plantao = baby.settings?.plantao;
  const diaNoite = new Date(agora).getHours() < 6 ? (new Date(agora).getDay() + 6) % 7 : new Date(agora).getDay();
  const quemPlantao = plantao?.dias?.[String(diaNoite)];
  const [madPref, setMadPref] = useState(() => { try { return localStorage.getItem('ninho-madrugada') || 'auto'; } catch { return 'auto'; } });
  const madrugada = madPref === 'on' || (madPref === 'auto' && ehMadrugada(agora));
  const trocarMadrugada = () => {
    const v = madrugada ? 'off' : 'on';
    try { localStorage.setItem('ninho-madrugada', v); } catch { /* sem storage */ }
    setMadPref(v);
    window.dispatchEvent(new Event('ninho-madrugada'));
  };
  const repetirAgora = (tipo: EventType, d: BabyEvent['data']) => {
    const novoId = uid();
    void act(() => api.create('events', baby.id, { id: novoId, type: tipo, start_at: new Date().toISOString(), end_at: null, data: d }),
      `${TIPOS[tipo].label} registrada ✓`, () => api.remove('events', baby.id, novoId));
  };

  const encerrar = (e: BabyEvent) => act(
    () => api.update('events', baby.id, e.id, { end_at: new Date().toISOString() }),
    `${TIPOS[e.type].label} encerrada: ${duracao((Date.now() - t(e.start_at)) / MIN)}`,
    () => api.update('events', baby.id, e.id, { end_at: null }),
  );

  return (
    <div className="page">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="faint">Olá, {user.name.split(' ')[0]} · {meuPapel.emoji} {meuPapel.label}</p>
          <h1>{baby.name.split(' ')[0]} tem {id.texto}</h1>
        </div>
        <span className="chip brand hide-mob">Você registrou {meusHoje} hoje</span>
      </div>

      {(quemPlantao || madrugada || ehMadrugada(agora)) && (
        <div className="wrap-row">
          {quemPlantao && <span className="chip info">🌙 Plantão desta noite: <b style={{ marginLeft: 4 }}>{quemPlantao === user.id ? 'você' : nome(quemPlantao)}</b></span>}
          <button className="chip" onClick={trocarMadrugada}><Moon size={13} /> {madrugada ? 'Modo madrugada ligado · desligar' : 'Ligar modo madrugada'}</button>
        </div>
      )}

      {chegada && chegada.total + chegada.notas.length > 0 && (
        <div className="card chegada">
          <div className="card-h"><h2>👋 Enquanto você esteve fora</h2><span className="faint">desde {hm(visita!)} · {chegada.quem.map((q) => nome(q).split(' ')[0]).join(', ') || 'família'}</span></div>
          <div className="wrap-row">
            {chegada.mamadas > 0 && <span className="chip">🍼 {chegada.mamadas} mamada(s){chegada.ultMamada ? ` · última ${hm(chegada.ultMamada.start_at)}` : ''}</span>}
            {chegada.sonoMin > 0 && <span className="chip">😴 dormiu {duracao(chegada.sonoMin)}</span>}
            {chegada.fraldas > 0 && <span className="chip">🧷 {chegada.fraldas} fralda(s){chegada.ultFralda ? ` · última ${hm(chegada.ultFralda.start_at)}` : ''}</span>}
            {chegada.remedios.map((r) => <span key={r.id} className="chip warn">💊 {r.data.med} às {hm(r.start_at)} ({nome(r.user_id).split(' ')[0]})</span>)}
            {chegada.saude.map((r) => <span key={r.id} className="chip bad">🌡️ {descreve(r, agora)} às {hm(r.start_at)}</span>)}
          </div>
          {chegada.notas.map((n) => <div key={n.id} className="note" style={{ marginTop: 8 }}>📌 {n.text}<div className="faint" style={{ color: 'inherit', opacity: 0.7 }}>{nome(n.user_id)}</div></div>)}
        </div>
      )}

      {ativos.map((e) => (
        <div key={e.id} className="timer" style={{ background: TIPOS[e.type].cor }}>
          <div style={{ fontSize: 30 }}>{TIPOS[e.type].emoji}</div>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>{e.type === 'sono' ? 'Dormindo' : `Mamando · ${e.data.side === 'E' ? 'esquerdo' : e.data.side === 'D' ? 'direito' : 'ambos'}`} desde {hm(e.start_at)}</div>
            <div className="clock">{cronometro(agora - t(e.start_at))}</div>
          </div>
          {podeEditar && <button className="btn" onClick={() => encerrar(e)}>{e.type === 'sono' ? <><Sun size={16} /> Acordou</> : <><Check size={16} /> Encerrar</>}</button>}
        </div>
      ))}

      <div className="since">
        <div><div className="l">🍼 Última mamada</div><div className="v">{ultFeed ? haQuanto(t(ultFeed.start_at), agora).replace('há ', '') : '—'}</div><div className="faint">{ultFeed ? `às ${hm(ultFeed.start_at)}` : 'sem registro'}</div></div>
        <div><div className="l">😴 {dormindo ? 'Dormindo' : 'Acordado'}</div><div className="v">{ultSono ? duracao((agora - t(dormindo ? ultSono.start_at : ultSono.end_at!)) / MIN) : '—'}</div><div className="faint">{ultSono ? (dormindo ? `desde ${hm(ultSono.start_at)}` : `acordou ${hm(ultSono.end_at!)}`) : 'sem registro'}</div></div>
        <div><div className="l">🧷 Última fralda</div><div className="v">{ultFralda ? haQuanto(t(ultFralda.start_at), agora).replace('há ', '') : '—'}</div><div className="faint">{ultFralda ? `às ${hm(ultFralda.start_at)}` : 'sem registro'}</div></div>
      </div>

      {(soneca || mamadaPrev || listaDoses.length > 0) && (
        <div className="stack" style={{ gap: 6 }}>
        <div className="row titulo-bloco"><h3>O que vem agora</h3><Ajuda titulo="Como o Ninho prevê?">
          <p><b>Próxima soneca:</b> o tempo que o bebê aguenta acordado muda com a idade. O Ninho começa pela faixa da idade e, com 4 sonecas registradas na semana, passa a usar o ritmo do seu bebê.</p>
          <p><b>Próxima mamada:</b> média do intervalo entre as mamadas das últimas 24 h.</p>
          <p><b>Remédios:</b> se você informar o intervalo da receita, o app mostra quando a próxima dose fica liberada e avisa se alguém tentar dar antes.</p>
        </Ajuda></div>
        <DicaUnica id="previsoes">Quando a janela de sono abrir, o card fica destacado. É um bom momento para começar o ritual de sono.</DicaUnica>
        <div className="prev-grid">
          {soneca && (
            <div className={`prev ${agora >= soneca.ini ? 'agora' : ''}`}>
              <div className="l">😴 Próxima soneca</div>
              <div className="v">{hm(soneca.ini)}–{hm(soneca.fim)}</div>
              <div className="faint">{agora > soneca.fim ? `passou da janela (acordado há ${duracao(soneca.acordadoMin)})` : agora >= soneca.ini ? 'janela aberta: bom momento para dormir' : `acordado há ${duracao(soneca.acordadoMin)}`} · {soneca.janela.fonte === 'historico' ? 'pelo ritmo dele(a)' : 'pela idade'}</div>
            </div>
          )}
          {mamadaPrev && (
            <div className={`prev ${agora >= mamadaPrev.previsao ? 'agora' : ''}`}>
              <div className="l">🍼 Próxima mamada (prevista)</div>
              <div className="v">~{hm(mamadaPrev.previsao)}</div>
              <div className="faint">intervalo médio de {duracao(mamadaPrev.intervaloMin)} nas últimas 24 h</div>
            </div>
          )}
          {listaDoses.map((d) => (
            <div key={d.med} className={`prev ${d.liberada ? '' : 'bloq'}`}>
              <div className="l">💊 {d.med}</div>
              <div className="v">{d.liberaEm ? (d.liberada ? 'liberada' : `${startOfDay(d.liberaEm) > startOfDay(agora) ? 'amanhã ' : 'a partir de '}${hm(d.liberaEm)}`) : `última ${hm(d.ultima)}`}</div>
              <div className="faint">última às {hm(d.ultima)} · {nome(d.quem).split(' ')[0]}{d.dose ? ` · ${d.dose}` : ''}{d.intervaloH ? ` · a cada ${d.intervaloH} h` : ''}</div>
            </div>
          ))}
        </div>
        </div>
      )}

      {podeEditar && (
        <div className="quick">
          {RAPIDOS.map((k) => (
            <button key={k} className="qbtn" onClick={() => abrirRegistro(k)}>
              <span className="em">{TIPOS[k].emoji}</span>{TIPOS[k].label}
            </button>
          ))}
        </div>
      )}
      {podeEditar && repetir.length > 0 && <DicaUnica id="repetir">Os atalhos com ↻ repetem o último registro igual (ex.: mesma fralda) com um toque. A mamada já sugere o outro peito.</DicaUnica>}
      {podeEditar && (
        <div className="wrap-row repetir">
          {repetir.map((r) => (
            <button key={r.ref.id} className="chip" onClick={() => repetirAgora(r.tipo, r.data)}>
              <RotateCcw size={13} /> {TIPOS[r.tipo].emoji} {r.tipo === 'mamada' ? `Mamada · ${r.data.side === 'E' ? 'esquerdo' : r.data.side === 'D' ? 'direito' : 'ambos'}` : descreve({ ...r.ref, data: r.data, end_at: r.ref.start_at }, agora).split(' · ')[0]}
            </button>
          ))}
          <button className="chip" onClick={() => abrirRegistro('extracao')}>{TIPOS.extracao.emoji} Extração</button>
          <button className="chip" onClick={() => abrirRegistro('outro')}>{TIPOS.outro.emoji} Outro</button>
        </div>
      )}

      <PrimeirosPassos />

      {noiteRes && (
        <div className="card noite-card">
          <div className="card-h"><h2>🌙 Como foi a noite</h2><span className="faint">{hm(noiteRes.ini)} → {hm(noiteRes.fim)}</span></div>
          <div className="grid g4">
            <div><div className="lab faint">Dormiu</div><b>{duracao(noiteRes.totalMin)}</b></div>
            <div><div className="lab faint">Maior sono seguido</div><b>{duracao(noiteRes.maiorMin)}</b></div>
            <div><div className="lab faint">Despertares</div><b>{noiteRes.despertares}</b></div>
            <div><div className="lab faint">Mamadas na noite</div><b>{noiteRes.mamadas}</b></div>
          </div>
          {Object.keys(noiteRes.porPessoa).length > 0 && <p className="faint" style={{ marginTop: 8 }}>Quem levantou: {Object.entries(noiteRes.porPessoa).sort((a, b) => b[1] - a[1]).map(([u, n]) => `${nome(u).split(' ')[0]} (${n})`).join(' · ')}</p>}
        </div>
      )}

      <div className="card hide-desk">
        <div className="card-h"><h2>Onde agir agora</h2><div className="row" style={{ gap: 4 }}><span className="faint">{lista.length} ponto(s)</span><AjudaOndeAgir /></div></div>
        <InsightList itens={lista.slice(0, 3)} vazio="Tudo dentro do esperado por aqui. 💛" />
        {lista.length > 3 && <p className="faint" style={{ marginTop: 8 }}>+{lista.length - 3} ponto(s) em Evolução, Casa e Saúde.</p>}
      </div>

      <div className="grid lg3">
        <div className="stack" style={{ gap: 16 }}>
          <Secao id="hoje-ate-agora" aberta={!mobile} titulo="Hoje até agora" extra={<Ajuda titulo="Hoje até agora"><p>Soma do dia até este horário. A seta compara com a <b>média dos últimos 7 dias no mesmo horário</b>, para ser uma comparação justa no meio do dia.</p><p>Verde: melhor que o habitual · vermelho: abaixo do habitual · cinza: parecido.</p></Ajuda>}>
            {semHistorico ? (
              <Empty emoji="📊">Os números do dia aparecem conforme a família registra. Com alguns dias de registros, o Ninho compara cada dia com a média da semana.</Empty>
            ) : (
              <>
                <p className="faint" style={{ marginBottom: 8 }}>Comparado com a média dos últimos 7 dias, no mesmo horário.</p>
                <div className="grid g4">
                  <Mini rot="Sono" val={duracao(hj.sleepMin)} base={base.sleepMin} atual={hj.sleepMin} sub={`${hj.naps} soneca(s)`} />
                  <Mini rot="Mamadas" val={String(hj.feeds)} base={base.feeds} atual={hj.feeds} sub={hj.bottleMl ? `${hj.bottleMl} ml na mamadeira` : `${duracao(hj.breastMin)} no peito`} />
                  <Mini rot="Xixi" val={String(hj.wet)} base={base.wet} atual={hj.wet} sub={`${hj.diapers} fralda(s)`} />
                  <Mini rot="Cocô" val={String(hj.poop)} base={base.poop} atual={hj.poop} neutro sub={`média ${base.poop.toFixed(1)}`} />
                </div>
              </>
            )}
          </Secao>

          <div className="card">
            <div className="card-h">
              <div className="row" style={{ gap: 4 }}><h2>Rotina planejada</h2><Ajuda titulo="Rotina planejada"><p>Cada horário é comparado com os registros (tolerância de 45 min): <b>verde</b> aconteceu, <b>vermelho</b> passou sem registro, <b>rosa</b> é o próximo.</p><p>Toque num horário para marcar como feito ou pulado. Com alguns dias de registros, o Ninho sugere uma rotina com os horários reais do bebê.</p></Ajuda></div>
              {rotina.pct != null && <span className={`chip ${rotina.pct >= 0.7 ? 'ok' : 'warn'}`}>{rotina.feitos}/{rotina.avaliados} no horário</span>}
            </div>
            {rotina.itens.length ? (
              <div className="wrap-row">
                {rotina.itens.map((i, k) => (
                  <button key={k} type="button" className={`chip chip-rotina ${i.status === 'ok' ? 'ok' : i.status === 'perdido' ? 'bad' : i.status === 'proximo' ? 'brand' : ''}`} title={i.real ? `Aconteceu às ${hm(i.real)}` : 'Toque para marcar'} onClick={() => setItemRotina(i)}>
                    {i.tipo === 'mamada' ? '🍼' : '😴'} {i.hora}{i.status === 'ok' ? (i.manual === 'feito' && !i.real ? ' ✓ (manual)' : ' ✓') : i.status === 'perdido' ? ' ✕' : i.status === 'pulado' ? ' · pulou' : i.status === 'proximo' ? ' · próximo' : ''}
                  </button>
                ))}
              </div>
            ) : (
              <Empty emoji="🗓️">Defina os horários de mamadas e sonecas para acompanhar a rotina.<br /><button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAba('familia')}>Definir rotina</button>{sugestao && <button className="btn sm" style={{ marginTop: 8, marginLeft: 6 }} onClick={() => setVerSugestao(true)}>✨ Usar sugestão pelos registros</button>}</Empty>
            )}
            {rotina.itens.length > 0 && <p className="faint" style={{ marginTop: 8 }}>Toque num horário para marcar como feito ou pulado. {sugestao && sugestao.mudancas.length > 0 && <button className="linkbtn" onClick={() => setVerSugestao(true)}>✨ A rotina real mudou: ver sugestão</button>}</p>}
          </div>

          <Secao id="linha-tempo" aberta={!mobile} titulo={`Linha do tempo · ${doDia.length} registro(s)`} extra={
              <div className="row">
                <button className="icon-btn" onClick={() => setDiaSel(addDays(diaSel, -1))} aria-label="Dia anterior"><ChevronLeft size={16} /></button>
                <span style={{ fontWeight: 800, minWidth: 70, textAlign: 'center' }}>{diaSel === hoje ? 'Hoje' : diaSel === hoje - DIA ? 'Ontem' : `${diaSemana(diaSel)} ${dataCurta(diaSel)}`}</span>
                <button className="icon-btn" disabled={diaSel >= hoje} onClick={() => setDiaSel(addDays(diaSel, 1))} aria-label="Próximo dia"><ChevronRight size={16} /></button>
              </div>}>
            {doDia.length ? (
              <div className="tl">
                {doDia.map((e) => (
                  <div key={e.id} className="tl-item" onClick={() => abrirRegistro(e.type, e)} style={{ cursor: 'pointer' }}>
                    <span className="tl-time">{hm(e.start_at)}</span>
                    <span className="tl-ico" style={{ background: `${TIPOS[e.type].cor}22` }}>{e.type === 'fralda' && e.data.diaper !== 'xixi' && e.data.diaper !== 'seca' ? '💩' : TIPOS[e.type].emoji}</span>
                    <div className="grow">
                      <div style={{ fontWeight: 700 }}>{descreve(e, agora)}</div>
                      <div className="faint">{nome(e.user_id)}{e.note ? ` · ${e.note}` : ''}{e.pendente && <span className="pend"> · ⏳ aguardando internet</span>}</div>
                    </div>
                    {(() => { const m = data.members.find((x) => x.user_id === e.user_id); return m ? <Avatar photo={m.photo} emoji={papel(m.role).emoji} size={28} /> : null; })()}
                  </div>
                ))}
              </div>
            ) : <Empty emoji="🌙">{diaSel === hoje && podeEditar ? <>Nenhum registro hoje ainda.<br /><button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => abrirRegistro('mamada')}>Registrar agora</button></> : 'Nenhum registro neste dia.'}</Empty>}
          </Secao>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Secao id="dica-semana" className="dica" titulo={`💡 ${dica.titulo}`} aberta>
            <p>{dica.texto}</p>
            <p className="faint" style={{ marginTop: 6 }}>Fonte: {dica.fonte}. Em caso de dúvida, fale com o pediatra.</p>
          </Secao>
          <div className="card hide-mob">
            <div className="card-h"><h2>Onde agir agora</h2><div className="row" style={{ gap: 4 }}><span className="faint">{lista.length} ponto(s)</span><AjudaOndeAgir /></div></div>
            <InsightList itens={lista.slice(0, 5)} vazio="Tudo dentro do esperado por aqui. 💛" />
          </div>
          <div className="card">
            <div className="card-h"><h2>Recados fixados</h2><button className="btn sm ghost" onClick={() => setAba('mural')}>Ver recados</button></div>
            {fixados.length ? (
              <div className="stack">
                {fixados.map((n) => <div key={n.id} className="note"><Pin size={13} style={{ float: 'right', opacity: 0.6 }} />{n.text}<div className="faint" style={{ marginTop: 4, color: 'inherit', opacity: 0.7 }}>{nome(n.user_id)}</div></div>)}
              </div>
            ) : <p className="faint">Nenhum recado fixado.</p>}
          </div>
        </div>
      </div>
      {itemRotina && <ItemRotinaSheet item={itemRotina} onClose={() => setItemRotina(null)} />}
      {verSugestao && <SugestaoRotinaSheet onClose={() => setVerSugestao(false)} />}
    </div>
  );
}

function ItemRotinaSheet({ item, onClose }: { item: ItemRotina; onClose: () => void }) {
  const { data, act, podeEditar, abrirRegistro, agora } = useApp();
  const baby = data.baby;
  const hoje = startOfDay(agora);
  const titulo = `${item.tipo === 'mamada' ? '🍼 Mamada' : '😴 Soneca'} das ${item.hora}`;
  const [hh, mm] = item.hora.split(':').map(Number);
  const futuro = hoje + (hh * 60 + mm) * 60_000 > agora + 60 * 60_000; // só dá para marcar "feita" a partir de 1 h antes
  const marcar = (value: 'feito' | 'pulado') => act(
    () => (item.checkId ? api.update('checks', baby.id, item.checkId, { value }) : api.create('checks', baby.id, { id: idCheck(baby.id, 'rotina', item.code), kind: 'rotina', code: item.code, date: ymd(hoje), value })),
    value === 'feito' ? `${titulo.slice(3)} marcada como feita ✓` : `${titulo.slice(3)} marcada como pulada`,
  ).then((ok) => ok && onClose());
  const desmarcar = () => item.checkId && act(() => api.remove('checks', baby.id, item.checkId!), 'Marcação removida').then((ok) => ok && onClose());
  return (
    <Sheet title={titulo} onClose={onClose}>
      <p className="faint">
        {item.real ? `Registrada às ${hm(item.real)} — já conta como cumprida.` : item.manual === 'feito' ? 'Marcada como feita manualmente.' : item.manual === 'pulado' ? 'Marcada como pulada hoje (não conta contra a rotina).' : item.status === 'perdido' ? 'Nenhum registro perto deste horário (tolerância de 45 min).' : 'Ainda não aconteceu.'}
      </p>
      {podeEditar ? (
        <div className="stack" style={{ gap: 8 }}>
          {!item.real && item.manual !== 'feito' && !futuro && <button className="btn primary block" onClick={() => marcar('feito')}>✓ Marcar como feita</button>}
          {futuro && !item.manual && <p className="faint">Ainda não chegou a hora: dá para marcar como feita a partir de 1 h antes.</p>}
          <button className="btn block" onClick={() => { onClose(); abrirRegistro(item.tipo === 'mamada' ? 'mamada' : 'sono'); }}>✍️ Registrar com detalhes ({item.tipo === 'mamada' ? 'lado, duração' : 'início e fim'})</button>
          {item.manual !== 'pulado' && !item.real && <button className="btn block" onClick={() => marcar('pulado')}>⏭️ Pulou hoje</button>}
          {item.manual && <button className="btn ghost block" onClick={desmarcar}>Desmarcar</button>}
          <p className="faint">Marcar como feita só conta para a rotina. Para entrar nos indicadores (sono, mamadas), use “Registrar com detalhes”.</p>
        </div>
      ) : <div className="chip warn">Seu acesso é somente leitura.</div>}
    </Sheet>
  );
}

function AjudaOndeAgir() {
  return (
    <Ajuda titulo="Onde agir agora">
      <p>O Ninho lê os registros e aponta o que merece atenção: mamada atrasada, febre, estoque acabando, vacina ou consulta chegando.</p>
      <p><b>Vermelho</b> é urgente, <b>amarelo</b> pede atenção e <b>azul</b> é informação. Toque em “Ver” para ir direto ao lugar certo.</p>
    </Ajuda>
  );
}

function Mini({ rot, val, sub, atual, base, neutro }: { rot: string; val: string; sub: string; atual: number; base: number; neutro?: boolean }) {
  return (
    <div className="kpi" style={{ background: 'var(--surface-2)', borderRadius: 14, border: '1px solid var(--line)' }}>
      <div className="lab">{rot}</div>
      <div className="val" style={{ fontSize: 22 }}>{val}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Delta atual={atual} anterior={base} neutro={neutro} /><span className="faint" style={{ fontSize: 12 }}>{sub}</span></div>
    </div>
  );
}
