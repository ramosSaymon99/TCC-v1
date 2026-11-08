/** Rotina do dia: botões para marcar tudo, rotina planejada com check e linha do tempo (usados no Hoje e na aba Rotina). */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { TIPOS, papel } from '../lib/constants';
import { aderencia, type ItemRotina } from '../lib/metrics';
import { sugestoesRepetir } from '../lib/previsao';
import { sugerirRotina } from '../lib/rotina';
import { idCheck } from '../lib/conteudo';
import { DIA, addDays, dataCurta, diaSemana, hm, startOfDay, t, uid, ymd } from '../lib/time';
import { pl } from '../lib/texto';
import type { BabyEvent, EventType } from '../types';
import { descreve } from '../pages/Hoje';
import { SugestaoRotinaSheet } from '../pages/Familia';
import { Avatar } from './Avatar';
import { Ajuda, DicaUnica, Secao } from './Guia';
import { Empty, Sheet } from './ui';

const RAPIDOS: EventType[] = ['mamada', 'mamadeira', 'sono', 'fralda', 'remedio', 'saude', 'banho', 'alimentacao'];

/** Botões para marcar qualquer registro e atalhos para repetir o último. */
export function BotoesRegistro() {
  const { data, agora, abrirRegistro, act, podeEditar } = useApp();
  const { baby, events } = data;
  const repetir = useMemo(() => sugestoesRepetir(events), [events]);
  const repetirAgora = (tipo: EventType, d: BabyEvent['data']) => {
    const novoId = uid();
    void act(() => api.create('events', baby.id, { id: novoId, type: tipo, start_at: new Date().toISOString(), end_at: null, data: d }),
      `${TIPOS[tipo].label} registrada ✓`, () => api.remove('events', baby.id, novoId));
  };
  if (!podeEditar) return null;
  return (
    <>
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
    </>
  );
}

/** Rotina planejada do dia: cada horário com o status e o check manual (feito/pulado). */
export function RotinaPlanejada() {
  const { data, agora, setAba } = useApp();
  const { baby, events } = data;
  const hoje = startOfDay(agora);
  const rotina = aderencia(events, baby.routine, hoje, agora, data.checks);
  const sugestao = useMemo(() => sugerirRotina(events, baby.routine, baby.birth_date, agora), [events, baby.routine, baby.birth_date, agora]);
  const [itemRotina, setItemRotina] = useState<ItemRotina | null>(null);
  const [verSugestao, setVerSugestao] = useState(false);
  return (
    <>
          <div className="card">
              <div className="card-h">
                <div className="row" style={{ gap: 4 }}><h2>Rotina planejada</h2><Ajuda titulo="Rotina planejada"><p>Cada horário é comparado com os registros (tolerância de 45 min): <b>verde</b> aconteceu, <b>cinza</b> passou sem registro, <b>rosa</b> é o próximo.</p><p>Toque num horário para marcar como feito ou pulado. Com alguns dias de registros, o Ninho sugere uma rotina com os horários reais do bebê.</p></Ajuda></div>
                {rotina.pct != null && <span className={`chip ${rotina.pct >= 0.7 ? 'ok' : 'warn'}`}>{rotina.feitos}/{rotina.avaliados} no horário</span>}
              </div>
              {rotina.itens.length ? (
                <div className="wrap-row">
                  {rotina.itens.map((i, k) => (
                    <button key={k} type="button" className={`chip chip-rotina ${i.status === 'ok' ? 'ok' : i.status === 'perdido' ? 'sem-registro' : i.status === 'proximo' ? 'brand' : ''}`} title={i.real ? `Aconteceu às ${hm(i.real)}` : 'Toque para marcar'} onClick={() => setItemRotina(i)}>
                      {i.tipo === 'mamada' ? '🍼' : '😴'} {i.hora}{i.status === 'ok' ? (i.manual === 'feito' && !i.real ? ' ✓ (manual)' : ' ✓') : i.status === 'perdido' ? ' · sem registro' : i.status === 'pulado' ? ' · pulou' : i.status === 'proximo' ? ' · próximo' : ''}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty emoji="🗓️">Defina os horários de mamadas e sonecas para acompanhar a rotina.<br /><button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAba('familia')}>Definir rotina</button>{sugestao && <button className="btn sm" style={{ marginTop: 8, marginLeft: 6 }} onClick={() => setVerSugestao(true)}>✨ Usar sugestão pelos registros</button>}</Empty>
              )}
              {rotina.itens.length > 0 && <p className="faint" style={{ marginTop: 8 }}>Toque num horário para marcar como feito ou pulado. {sugestao && sugestao.mudancas.length > 0 && <button className="linkbtn" onClick={() => setVerSugestao(true)}>✨ A rotina real mudou: ver sugestão</button>}</p>}
            </div>
      {itemRotina && <ItemRotinaSheet item={itemRotina} onClose={() => setItemRotina(null)} />}
      {verSugestao && <SugestaoRotinaSheet onClose={() => setVerSugestao(false)} />}
    </>
  );
}

/** Linha do tempo de um dia (com navegação entre dias). */
export function LinhaDoTempo() {
  const { data, agora, abrirRegistro, podeEditar, nome } = useApp();
  const hoje = startOfDay(agora);
  const [diaSel, setDiaSel] = useState(hoje);
  const [verTodos, setVerTodos] = useState(false);
  const doDia = data.events.filter((e) => t(e.start_at) >= diaSel && t(e.start_at) < addDays(diaSel, 1)).sort((a, b) => t(b.start_at) - t(a.start_at));
  return (
          <Secao id="linha-tempo" aberta titulo={`Linha do tempo · ${pl(doDia.length, 'registro', 'registros')}`} extra={
                <div className="row">
                  <button className="icon-btn" onClick={() => setDiaSel(addDays(diaSel, -1))} aria-label="Dia anterior"><ChevronLeft size={16} /></button>
                  <span style={{ fontWeight: 800, minWidth: 70, textAlign: 'center' }}>{diaSel === hoje ? 'Hoje' : diaSel === hoje - DIA ? 'Ontem' : `${diaSemana(diaSel)} ${dataCurta(diaSel)}`}</span>
                  <button className="icon-btn" disabled={diaSel >= hoje} onClick={() => setDiaSel(addDays(diaSel, 1))} aria-label="Próximo dia"><ChevronRight size={16} /></button>
                </div>}>
              {doDia.length ? (
                <div className="tl">
                  {(verTodos ? doDia : doDia.slice(0, 5)).map((e) => (
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
              ) : null}
              {doDia.length > 5 && <button className="btn sm ghost block" style={{ marginTop: 6 }} onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Mostrar menos' : `Ver todos os ${doDia.length} registros`}</button>}
              {!doDia.length && <Empty emoji="🌙">{diaSel === hoje && podeEditar ? <>Nenhum registro hoje ainda.<br /><button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => abrirRegistro('mamada')}>Registrar agora</button></> : 'Nenhum registro neste dia.'}</Empty>}
            </Secao>
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
