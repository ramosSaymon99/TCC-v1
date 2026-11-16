/** Introdução alimentar: sugestões do dia e da semana, catálogo com formas de oferecer e cortar, guia e histórico. */
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Search } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { ALIMENTOS, DICAS_GERAIS, EVITAR, GRUPOS, METODOS, NOME_FASE, PRATO, PRONTIDAO, QUANTIDADES, SEGURANCA, fase, jaOferecido, sugestoes, type Alimento, type Grupo } from '../lib/alimentacao';
import { ALERGENOS, REACOES, idCheck } from '../lib/conteudo';
import { dataBr, idade, uid, ymd } from '../lib/time';
import { pl } from '../lib/texto';
import type { EventData } from '../types';
import { Choice, Empty, Field, Sheet } from './ui';

type Aba = 'sugestoes' | 'alimentos' | 'guia' | 'historico';
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
/** Nome do alergênico na lista da Saúde (para o alimento aparecer marcado lá). */
const ALERGENO_DE: Record<string, string> = { macarrao: 'Trigo', iogurte: 'Leite de vaca', ovo: 'Ovo', peixe: 'Peixe', amendoim: 'Amendoim', gergelim: 'Gergelim' };

export function IntroAlimentar() {
  const { data, agora } = useApp();
  const meses = idade(data.baby.birth_date, agora).dias / 30.4;
  const alim = data.checks.filter((c) => c.kind === 'alimento');
  const oferecidos = useMemo(() => alim.map((a) => a.note ?? '').filter(Boolean), [alim]);
  const [aba, setAba] = useState<Aba>(() => {
    try { const v = sessionStorage.getItem('ninho-intro-aba'); if (v) { sessionStorage.removeItem('ninho-intro-aba'); return v as Aba; } } catch { /* sem storage */ }
    return meses < 5.5 ? 'guia' : 'sugestoes';
  });
  const [detalhe, setDetalhe] = useState<Alimento | null>(null);
  const [ofertar, setOfertar] = useState<Alimento | null>(null);
  const sug = useMemo(() => sugestoes(oferecidos), [oferecidos]);
  const f = fase(meses);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card intro-topo">
        <div className="between" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2>🥣 Introdução alimentar</h2>
            <p className="faint">{meses < 5.5 ? `Começa por volta dos 6 meses. Até lá: leite materno exclusivo (ou fórmula, se indicada).` : `Fase: ${NOME_FASE[f]} · ${pl(sug.provados, 'alimento experimentado', 'alimentos experimentados')} de ${sug.total} do guia`}</p>
          </div>
        </div>
        <div className="intro-barra" aria-label={`${sug.provados} de ${sug.total} alimentos`}><span style={{ width: `${(sug.provados / sug.total) * 100}%` }} /></div>
        <div className="seg intro-abas" role="tablist">
          {([['sugestoes', '✨', 'Sugestões'], ['alimentos', '🥕', 'Alimentos'], ['guia', '📖', 'Guia'], ['historico', '📝', 'Histórico']] as const).map(([v, e, l]) => (
            <button key={v} role="tab" aria-selected={aba === v} aria-label={l} className={aba === v ? 'on' : ''} onClick={() => setAba(v)}><span aria-hidden>{e}</span><span>{l}</span></button>
          ))}
        </div>
      </div>

      {aba === 'sugestoes' && <Sugestoes sug={sug} meses={meses} onVer={setDetalhe} onOfertar={setOfertar} />}
      {aba === 'alimentos' && <Catalogo oferecidos={oferecidos} meses={meses} onVer={setDetalhe} />}
      {aba === 'guia' && <Guia />}
      {aba === 'historico' && <Historico />}

      {detalhe && <DetalheAlimento a={detalhe} meses={meses} ja={jaOferecido(detalhe, oferecidos)} onClose={() => setDetalhe(null)} onOfertar={() => { setOfertar(detalhe); setDetalhe(null); }} />}
      {ofertar && <OfertaSheet a={ofertar} primeira={!jaOferecido(ofertar, oferecidos)} onClose={() => setOfertar(null)} />}
      <p className="disclaimer">Conteúdo educativo baseado no Guia Alimentar para Crianças Brasileiras Menores de 2 Anos (Ministério da Saúde) e na SBP. Não substitui a orientação do pediatra, principalmente em caso de prematuridade, alergias na família ou dificuldades para comer.</p>
    </div>
  );
}

function CartaoAlimento({ a, meses, onVer, ja }: { a: Alimento; meses: number; onVer: () => void; ja?: boolean }) {
  return (
    <button className={`alimento ${ja ? 'ja' : ''}`} onClick={onVer}>
      <span className="alimento-em">{a.emoji}</span>
      <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <b>{a.nome}</b>{ja && <span className="chip ok" style={{ marginLeft: 6 }}>✓ já experimentou</span>}
        <span className="faint" style={{ display: 'block' }}>{a[fase(meses)]}</span>
        <span className="wrap-row" style={{ marginTop: 4 }}>
          {a.alergenico && <span className="chip warn">alergênico</span>}
          {a.risco && <span className="chip bad">atenção ao corte</span>}
        </span>
      </span>
    </button>
  );
}

function Sugestoes({ sug, meses, onVer, onOfertar }: { sug: ReturnType<typeof sugestoes>; meses: number; onVer: (a: Alimento) => void; onOfertar: (a: Alimento) => void }) {
  const { podeEditar, data } = useApp();
  const nome = data.baby.name.split(' ')[0];
  if (meses < 5.5) return <div className="card"><Empty emoji="🍼">As sugestões começam perto dos 6 meses. Enquanto isso, veja no <b>Guia</b> os sinais de que {nome} está pronto(a) para começar.</Empty></div>;
  if (!sug.hoje) return <div className="card"><Empty emoji="🎉">{nome} já experimentou todos os alimentos do guia! Continue variando e oferecendo a comida da família.</Empty></div>;
  const h = sug.hoje;
  return (
    <>
      <div className="card intro-hoje">
        <p className="faint" style={{ fontWeight: 800 }}>SUGESTÃO DE HOJE</p>
        <div className="row" style={{ gap: 14, marginTop: 6 }}>
          <span style={{ fontSize: 54 }}>{h.emoji}</span>
          <div className="grow">
            <h2>{h.nome}</h2>
            <p style={{ marginTop: 4 }}><b>Como oferecer ({NOME_FASE[fase(meses)]}):</b> {h[fase(meses)]}</p>
            {h.dica && <p className="faint" style={{ marginTop: 4 }}>💡 {h.dica}</p>}
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {podeEditar && <button className="btn primary" onClick={() => onOfertar(h)}><Check size={16} /> Ofereci hoje</button>}
          <button className="btn" onClick={() => onVer(h)}>Ver todas as formas</button>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h2>📅 Plano da semana</h2><span className="faint">um alimento novo por dia</span></div>
        <div className="stack" style={{ gap: 8 }}>
          {sug.semana.map((a, i) => (
            <button key={a.id} className="plano-dia" onClick={() => onVer(a)}>
              <span className="plano-n">{i === 0 ? 'Hoje' : `Dia ${i + 1}`}</span>
              <span style={{ fontSize: 28 }}>{a.emoji}</span>
              <span className="grow" style={{ textAlign: 'left' }}><b>{a.nome}</b><span className="faint" style={{ display: 'block' }}>{GRUPOS[a.grupo].nome}{a.alergenico ? ' · alergênico: ofereça sozinho e observe' : ''}</span></span>
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginTop: 10 }}>Junto com o alimento novo, continue oferecendo os que {nome} já conhece. O plano se atualiza conforme vocês registram.</p>
      </div>
      <div className="card">
        <div className="card-h"><h2>🍽️ Monte o prato do almoço e jantar</h2></div>
        <div className="grid g2">{PRATO.map((p) => <div key={p.parte} className="prato-item"><span style={{ fontSize: 28 }}>{p.emoji}</span><div><b>{p.parte}</b><div className="faint">{p.ex}</div></div></div>)}</div>
      </div>
    </>
  );
}

function Catalogo({ oferecidos, meses, onVer }: { oferecidos: string[]; meses: number; onVer: (a: Alimento) => void }) {
  const [grupo, setGrupo] = useState<Grupo | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const lista = ALIMENTOS.filter((a) => (grupo === 'todos' || a.grupo === grupo) && (!busca.trim() || a.nome.toLowerCase().includes(busca.trim().toLowerCase())));
  return (
    <div className="card">
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <Search size={18} className="faint" />
        <input className="input" placeholder="Buscar alimento" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="wrap-row" style={{ marginBottom: 10 }}>
        <button className={`chip ${grupo === 'todos' ? 'brand' : ''}`} onClick={() => setGrupo('todos')}>Todos</button>
        {(Object.keys(GRUPOS) as Grupo[]).map((g) => <button key={g} className={`chip ${grupo === g ? 'brand' : ''}`} onClick={() => setGrupo(g)}>{GRUPOS[g].emoji} {GRUPOS[g].nome}</button>)}
      </div>
      <p className="faint" style={{ marginBottom: 8 }}>Forma de oferecer para a fase atual ({NOME_FASE[fase(meses)]}). Toque para ver as outras idades e registrar.</p>
      <div className="stack" style={{ gap: 8 }}>
        {lista.map((a) => <CartaoAlimento key={a.id} a={a} meses={meses} ja={jaOferecido(a, oferecidos)} onVer={() => onVer(a)} />)}
        {!lista.length && <p className="faint">Nenhum alimento encontrado.</p>}
      </div>
    </div>
  );
}

function DetalheAlimento({ a, meses, ja, onClose, onOfertar }: { a: Alimento; meses: number; ja: boolean; onClose: () => void; onOfertar: () => void }) {
  const { podeEditar } = useApp();
  const atual = fase(meses);
  return (
    <Sheet title={`${a.emoji} ${a.nome}`} onClose={onClose} footer={podeEditar ? <button className="btn primary" onClick={onOfertar}><Check size={16} /> {ja ? 'Ofereci de novo' : 'Ofereci hoje'}</button> : undefined}>
      <div className="wrap-row">
        <span className="chip">{GRUPOS[a.grupo].emoji} {GRUPOS[a.grupo].nome}</span>
        {ja && <span className="chip ok">✓ já experimentou</span>}
        {a.alergenico && <span className="chip warn">⚠️ alergênico</span>}
        {a.risco && <span className="chip bad">✂️ atenção ao corte</span>}
      </div>
      <h3>Como oferecer e cortar</h3>
      {(['m6', 'm9', 'm12'] as const).map((k) => (
        <div key={k} className={`fase-box ${k === atual ? 'atual' : ''}`}>
          <b>{NOME_FASE[k]}{k === atual ? ' · fase atual' : ''}</b>
          <p>{a[k]}</p>
        </div>
      ))}
      {a.dica && <p>💡 {a.dica}</p>}
      {a.alergenico && <div className="chip warn aviso">Na primeira vez, ofereça sozinho, de manhã ou no almoço, e observe por 2 a 3 dias: manchas, coceira, inchaço ou vômito. Inchaço nos lábios ou falta de ar: procure atendimento imediatamente.</div>}
    </Sheet>
  );
}

function OfertaSheet({ a, primeira, onClose }: { a: Alimento; primeira: boolean; onClose: () => void }) {
  const { data, act } = useApp();
  const [aceit, setAceit] = useState<EventData['acceptance']>('boa');
  const [reacao, setReacao] = useState('Sem reação');
  async function salvar() {
    const babyId = data.baby.id;
    const evId = uid();
    const alergeno = a.alergenico ? ALERGENO_DE[a.id] ?? (ALERGENOS.includes(a.nome) ? a.nome : undefined) : undefined;
    const nomeCheck = a.nome;
    const existe = data.checks.find((c) => c.kind === 'alimento' && c.code === slug(nomeCheck));
    const ok = await act(async () => {
      await api.create('events', babyId, { id: evId, type: 'alimentacao', start_at: new Date().toISOString(), end_at: null, data: { food: a.nome, acceptance: aceit, novo: primeira, ...(alergeno ? { alergeno } : {}), ...(reacao !== 'Sem reação' ? { reacao } : {}) }, note: null });
      const valor = reacao !== 'Sem reação' ? reacao : aceit;
      if (existe) { if (reacao !== 'Sem reação') await api.update('checks', babyId, existe.id, { value: reacao }); }
      else await api.create('checks', babyId, { id: idCheck(babyId, 'alimento', slug(nomeCheck)), kind: 'alimento', code: slug(nomeCheck), date: ymd(Date.now()), value: valor, note: nomeCheck });
      // alergênico com nome diferente (ex.: macarrão → Trigo) também fica marcado na lista de alergênicos
      if (alergeno && alergeno !== nomeCheck && !data.checks.some((c) => c.kind === 'alimento' && c.code === slug(alergeno))) {
        await api.create('checks', babyId, { id: idCheck(babyId, 'alimento', slug(alergeno)), kind: 'alimento', code: slug(alergeno), date: ymd(Date.now()), value: valor, note: alergeno });
      }
    }, `${a.nome} registrado ${a.emoji}`, () => api.remove('events', babyId, evId));
    if (ok) onClose();
  }
  return (
    <Sheet title={`${a.emoji} ${a.nome}${primeira ? ' · primeira vez' : ''}`} onClose={onClose} footer={<button className="btn primary" onClick={salvar}><Check size={16} /> Registrar</button>}>
      <Field label="Como aceitou"><Choice value={aceit} onChange={setAceit} options={[{ v: 'boa', l: '😋 Bem' }, { v: 'media', l: '😐 Pouco' }, { v: 'recusou', l: '🙅 Recusou' }]} /></Field>
      {aceit === 'recusou' && <p className="faint">Normal no começo! Ofereça de novo em outros dias, de outro jeito (outro corte ou misturado a algo que já aceita): às vezes são precisas 8 a 15 tentativas.</p>}
      <Field label="Alguma reação?"><select className="input" value={reacao} onChange={(e) => setReacao(e.target.value)}>{REACOES.filter((r) => r !== 'Recusou o alimento').map((r) => <option key={r}>{r}</option>)}</select></Field>
      {reacao !== 'Sem reação' && <div className="chip warn aviso"><AlertTriangle size={14} /> Suspenda esse alimento e fale com o pediatra. Inchaço nos lábios/olhos ou falta de ar: procure atendimento imediatamente.</div>}
      <p className="faint">Fica na linha do tempo e na lista de alimentos experimentados, para toda a família e para o relatório do pediatra.</p>
    </Sheet>
  );
}

function Guia() {
  return (
    <>
      <div className="card"><div className="card-h"><h2>🚦 Sinais de que está pronto(a)</h2></div>
        <ul className="lista-guia">{PRONTIDAO.map((p) => <li key={p}>✅ {p}</li>)}</ul>
      </div>
      <div className="card"><div className="card-h"><h2>🥄 Formas de apresentar</h2></div>
        <div className="stack" style={{ gap: 8 }}>{METODOS.map((m) => <div key={m.nome} className="fase-box"><b>{m.nome}</b><p>{m.texto}</p></div>)}</div>
      </div>
      <div className="card"><div className="card-h"><h2>✂️ Como cortar, por idade</h2></div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="fase-box"><b>6 a 8 meses · mão inteira</b><p>Palitos do tamanho e da largura de 1 a 2 dedos de adulto, macios a ponto de amassar entre o polegar e o indicador. Ou amassado com garfo.</p></div>
          <div className="fase-box"><b>9 a 11 meses · movimento de pinça</b><p>Pedaços pequenos, do tamanho da ponta do dedo, desfiados ou picados. Textura mais firme, mas ainda macia.</p></div>
          <div className="fase-box"><b>A partir de 1 ano · comida da família</b><p>Mesma comida da família, em pedaços pequenos. Redondos e firmes (uva, tomate-cereja) sempre cortados em 4 no comprimento.</p></div>
        </div>
      </div>
      <div className="card"><div className="card-h"><h2>🍽️ Quantidade e refeições</h2></div>
        <div className="tab-scroll"><table className="tab-simples"><thead><tr><th>Idade</th><th>Por refeição</th><th>No dia</th></tr></thead><tbody>
          {QUANTIDADES.map((q) => <tr key={q.idade}><td><b>{q.idade}</b></td><td>{q.qtd}</td><td>{q.refeicoes}</td></tr>)}
        </tbody></table></div>
        <p className="faint" style={{ marginTop: 8 }}>São referências: respeite a fome e a saciedade do bebê.</p>
      </div>
      <div className="card"><div className="card-h"><h2>🛟 Segurança e engasgo</h2></div><ul className="lista-guia">{SEGURANCA.map((p) => <li key={p}>• {p}</li>)}</ul></div>
      <div className="card"><div className="card-h"><h2>🚫 O que evitar</h2></div>
        <div className="stack" style={{ gap: 6 }}>{EVITAR.map((e) => <div key={e.item} className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span style={{ fontSize: 24 }}>{e.emoji}</span><div><b>{e.item}</b><div className="faint">{e.motivo}</div></div></div>)}</div>
      </div>
      <div className="card"><div className="card-h"><h2>💛 Para facilitar</h2></div><ul className="lista-guia">{DICAS_GERAIS.map((p) => <li key={p}>• {p}</li>)}</ul></div>
    </>
  );
}

function Historico() {
  const { data, podeEditar, abrirRegistro } = useApp();
  const alim = data.checks.filter((c) => c.kind === 'alimento').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const nomes = new Set(alim.map((a) => (a.note ?? '').toLowerCase()));
  const reacoes = alim.filter((a) => a.value && !['Sem reação', 'boa', 'media', 'recusou', 'Recusou o alimento'].includes(a.value));
  return (
    <div className="card">
      <div className="card-h"><h2>📝 Já experimentados ({alim.length})</h2>{podeEditar && <button className="btn sm" onClick={() => abrirRegistro('alimentacao')}>Outra refeição</button>}</div>
      {reacoes.length > 0 && <div className="chip bad aviso" style={{ marginBottom: 10 }}>⚠️ Reação registrada: {reacoes.map((r) => `${r.note} (${r.value})`).join('; ')}. Mostre ao pediatra.</div>}
      <h3 style={{ margin: '6px 0' }}>Alergênicos</h3>
      <div className="wrap-row" style={{ marginBottom: 10 }}>{ALERGENOS.map((a) => <span key={a} className={`chip ${nomes.has(a.toLowerCase()) ? 'ok' : ''}`}>{nomes.has(a.toLowerCase()) ? '✓ ' : ''}{a}</span>)}</div>
      {alim.length ? alim.map((a) => (
        <div key={a.id} className="list-item"><div className="grow"><b>{a.note}</b><div className="faint">primeira vez em {a.date ? dataBr(a.date) : '—'}{a.value ? ` · ${({ boa: 'aceitou bem', media: 'comeu pouco', recusou: 'recusou' } as Record<string, string>)[a.value] ?? a.value}` : ''}</div></div></div>
      )) : <Empty emoji="🥣">Ainda nenhum alimento registrado. Use as Sugestões para começar.</Empty>}
    </div>
  );
}
