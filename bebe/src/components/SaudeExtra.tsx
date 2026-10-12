import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check as CheckIcon, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { ALERGENOS, MARCOS, RESULTADOS_TESTE, TESTES_RN, avaliarFebre, idCheck } from '../lib/conteudo';
import { DIA, HORA, dataBr, hm, idade, parseYmd, t, ymd } from '../lib/time';
import { doses } from '../lib/previsao';
import type { Check } from '../types';
import { Empty, Field, Sheet } from './ui';

/* ---------- Febre e sintomas ---------- */
export function FebreSintomas() {
  const { data, agora, nome, abrirRegistro, podeEditar } = useApp();
  const regs = data.events.filter((e) => e.type === 'saude').sort((a, b) => t(b.start_at) - t(a.start_at));
  const temps = regs.filter((e) => e.data.temp != null && t(e.start_at) > agora - 48 * HORA).sort((a, b) => t(a.start_at) - t(b.start_at))
    .map((e) => ({ ts: t(e.start_at), temp: e.data.temp, rot: `${hm(e.start_at)}` }));
  const dias = idade(data.baby.birth_date, agora).dias;
  const ult = regs[0];
  const aval = ult && t(ult.start_at) > agora - 24 * HORA ? avaliarFebre(ult.data.temp, dias, ult.data.sintomas) : null;
  return (
    <>
      <div className="card">
        <div className="card-h"><h2>🌡️ Febre e sintomas</h2>{podeEditar && <button className="btn sm primary" onClick={() => abrirRegistro('saude')}><Plus size={14} /> Registrar</button>}</div>
        {aval && aval.nivel !== 'ok' && <div className={`chip ${aval.nivel === 'alerta' ? 'bad' : 'warn'}`} style={{ whiteSpace: 'normal', marginBottom: 10 }}>{aval.nivel === 'alerta' ? '🚨' : '⚠️'} {aval.texto}</div>}
        {temps.length >= 2 ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={temps} margin={{ left: -18, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => hm(v)} tickLine={false} axisLine={false} />
                <YAxis domain={[35.5, 40.5]} tickLine={false} axisLine={false} />
                <ReferenceLine y={37.8} stroke="var(--warn)" strokeDasharray="4 3" label={{ value: 'febre 37,8', position: 'insideTopRight', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} labelFormatter={(v) => new Date(Number(v)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} formatter={(v) => [`${String(v).replace('.', ',')} °C`, 'Temperatura']} />
                <Line dataKey="temp" stroke="#E2873C" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="faint">Registre a temperatura a cada medição: a curva das últimas 48 h aparece aqui e vai no relatório para o pediatra.</p>}
        <p className="disclaimer">Febre: temperatura axilar a partir de 37,8 °C. Em bebês com menos de 3 meses, febre pede atendimento imediato (SBP).</p>
      </div>
      <div className="card">
        <div className="card-h"><h2>Registros</h2></div>
        {regs.length ? regs.slice(0, 30).map((e) => (
          <div key={e.id} className="list-item" onClick={() => abrirRegistro('saude', e)} style={{ cursor: 'pointer' }}>
            <div className="tl-ico" style={{ background: '#E2873C22' }}>🌡️</div>
            <div className="grow">
              <b>{e.data.temp != null ? `${String(e.data.temp).replace('.', ',')} °C` : 'Sintomas'}</b> {e.data.sintomas?.length ? <span className="faint">· {e.data.sintomas.join(', ')}</span> : null}
              <div className="faint">{new Date(e.start_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {nome(e.user_id)}{e.note ? ` · ${e.note}` : ''}</div>
            </div>
            {e.data.temp != null && e.data.temp >= 37.8 && <span className="chip bad">febre</span>}
          </div>
        )) : <Empty emoji="🌡️">Nenhum registro de febre ou sintoma.</Empty>}
      </div>
    </>
  );
}

/* ---------- Remédios em uso (com próxima dose) ---------- */
export function RemediosEmUso() {
  const { data, agora, nome } = useApp();
  const lista = doses(data.events, agora);
  if (!lista.length) return null;
  return (
    <div className="card">
      <div className="card-h"><h2>Em uso agora</h2><span className="faint">últimos 3 dias</span></div>
      {lista.map((d) => (
        <div key={d.med} className="list-item">
          <div className="tl-ico" style={{ background: 'var(--info-soft)' }}>💊</div>
          <div className="grow">
            <b>{d.med}</b> {d.dose && <span className="faint">· {d.dose}</span>}
            <div className="faint">última às {hm(d.ultima)} ({nome(d.quem).split(' ')[0]}){d.intervaloH ? ` · a cada ${d.intervaloH} h` : ''}{d.lembrar ? ' · com lembrete' : ''}</div>
          </div>
          {d.liberaEm ? <span className={`chip ${d.liberada ? 'ok' : 'warn'}`}>{d.liberada ? 'liberada' : `a partir de ${hm(d.liberaEm)}`}</span> : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- Perguntas para a próxima consulta ---------- */
export function Perguntas() {
  const { data, act, podeEditar, nome, agora } = useApp();
  const [texto, setTexto] = useState('');
  const perguntas = data.notes.filter((n) => n.kind === 'pergunta').sort((a, b) => a.done - b.done || b.created_at.localeCompare(a.created_at));
  const proxima = data.appointments.filter((a) => !a.done && t(a.date) >= agora).sort((a, b) => t(a.date) - t(b.date))[0];
  async function add() {
    if (!texto.trim()) return;
    if (await act(() => api.create('notes', data.baby.id, { text: texto.trim(), pinned: 0, done: 0, kind: 'pergunta' }), 'Pergunta anotada ✓')) setTexto('');
  }
  return (
    <div className="card">
      <div className="card-h"><h2>❓ Perguntas para a próxima consulta</h2><span className="faint">{proxima ? `consulta em ${new Date(proxima.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : 'vão no relatório PDF'}</span></div>
      {podeEditar && (
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="input grow" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="ex.: É normal ela regurgitar depois de mamar?" />
          <button className="btn primary" onClick={add} aria-label="Adicionar pergunta"><Plus size={16} /></button>
        </div>
      )}
      {perguntas.length ? perguntas.map((n) => (
        <div key={n.id} className="list-item" style={{ opacity: n.done ? 0.55 : 1 }}>
          <input type="checkbox" disabled={!podeEditar} checked={!!n.done} title="Respondida" style={{ width: 20, height: 20 }} onChange={(e) => act(() => api.update('notes', data.baby.id, n.id, { done: e.target.checked ? 1 : 0 }))} />
          <div className="grow">
            <div style={{ textDecoration: n.done ? 'line-through' : 'none' }}>{n.text}</div>
            <div className="faint">{nome(n.user_id)} · {new Date(n.created_at).toLocaleDateString('pt-BR')}{n.done ? ' · respondida' : ''}</div>
          </div>
          {podeEditar && <button className="icon-btn" aria-label="Excluir" onClick={() => act(() => api.remove('notes', data.baby.id, n.id))}><Trash2 size={15} /></button>}
        </div>
      )) : <Empty emoji="❓">Qualquer cuidador pode anotar dúvidas aqui ao longo das semanas. Elas saem no relatório para o pediatra.</Empty>}
    </div>
  );
}

/* ---------- Checklists com data: marcos, testes, alimentos ---------- */
function useChecks(kind: Check['kind']) {
  const { data, act } = useApp();
  const mapa = new Map(data.checks.filter((c) => c.kind === kind).map((c) => [c.code, c]));
  const salvar = (code: string, campos: Partial<Check>) => {
    const atual = mapa.get(code);
    return act(() => (atual ? api.update('checks', data.baby.id, atual.id, campos) : api.create('checks', data.baby.id, { id: idCheck(data.baby.id, kind, code), kind, code, ...campos })));
  };
  const remover = (code: string) => { const a = mapa.get(code); return a ? act(() => api.remove('checks', data.baby.id, a.id)) : Promise.resolve(false); };
  return { mapa, salvar, remover };
}

export function Marcos() {
  const { data, agora, podeEditar } = useApp();
  const { mapa, salvar, remover } = useChecks('marco');
  const meses = idade(data.baby.birth_date, agora).dias / 30.4;
  const conversar = MARCOS.filter((m) => !mapa.has(m.code) && meses > m.ate);
  const status = (m: typeof MARCOS[number]) => (mapa.has(m.code) ? 'ok' : meses > m.ate ? 'conversar' : meses >= m.de ? 'agora' : 'futuro');
  return (
    <div className="card">
      <div className="card-h"><h2>⭐ Marcos do desenvolvimento</h2><span className="faint">{mapa.size} conquistado(s)</span></div>
      {conversar.length > 0 && <div className="chip warn" style={{ whiteSpace: 'normal', marginBottom: 10 }}>💬 Vale comentar com o pediatra na próxima consulta: {conversar.map((m) => m.nome.split(' (')[0].toLowerCase()).join(', ')}. Cada bebê tem seu ritmo; o pediatra avalia o conjunto.</div>}
      {MARCOS.map((m) => {
        const c = mapa.get(m.code);
        const st = status(m);
        return (
          <div key={m.code} className="list-item">
            <input type="checkbox" disabled={!podeEditar} checked={!!c} style={{ width: 22, height: 22 }} onChange={(e) => (e.target.checked ? salvar(m.code, { date: ymd(agora) }) : remover(m.code))} />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{m.nome}</div>
              <div className="faint">{m.area} · costuma aparecer entre {m.de} e {m.ate} meses{c?.date ? ` · conquistado em ${dataBr(c.date)}` : ''}</div>
            </div>
            {c && podeEditar ? <input type="date" className="input" style={{ width: 150, minHeight: 36, padding: '4px 8px', fontSize: 14 }} value={c.date ?? ''} onChange={(e) => e.target.value && salvar(m.code, { date: e.target.value })} />
              : <span className={`chip ${st === 'conversar' ? 'warn' : st === 'agora' ? 'brand' : ''}`}>{st === 'conversar' ? 'comentar' : st === 'agora' ? 'fase atual' : st === 'ok' ? '✓' : 'mais adiante'}</span>}
          </div>
        );
      })}
      <p className="disclaimer">Faixas aproximadas, baseadas na Caderneta da Criança (Ministério da Saúde). Não é diagnóstico.</p>
    </div>
  );
}

export function TestesRN() {
  const { data, agora, podeEditar } = useApp();
  const { mapa, salvar, remover } = useChecks('teste');
  const nasc = parseYmd(data.baby.birth_date);
  const [editar, setEditar] = useState<string | null>(null);
  return (
    <div className="card">
      <div className="card-h"><h2>👶 Testes do recém-nascido</h2><span className="faint">{mapa.size}/{TESTES_RN.length} registrados</span></div>
      {TESTES_RN.map((x) => {
        const c = mapa.get(x.code);
        const atrasado = !c && agora > nasc + (x.dias + 3) * DIA;
        return (
          <div key={x.code} className="list-item" onClick={() => podeEditar && setEditar(x.code)} style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
            <div className="tl-ico" style={{ background: c ? 'var(--ok-soft)' : 'var(--surface-2)' }}>{c ? <CheckIcon size={16} /> : '🧪'}</div>
            <div className="grow">
              <b>{x.nome}</b>
              <div className="faint">{c ? `${dataBr(c.date ?? '')}${c.value ? ` · ${RESULTADOS_TESTE.find((r) => r.v === c.value)?.l ?? c.value}` : ''}${c.note ? ` · ${c.note}` : ''}` : x.quando}</div>
            </div>
            {!c && <span className={`chip ${atrasado ? 'warn' : ''}`}>{atrasado ? 'sem registro' : 'pendente'}</span>}
            {c?.value === 'refazer' && <span className="chip warn">refazer</span>}
            {c?.value === 'alterado' && <span className="chip bad">alterado</span>}
          </div>
        );
      })}
      <p className="disclaimer">Triagens neonatais do SUS. Resultado alterado ou "refazer": siga a orientação da maternidade ou do pediatra.</p>
      {editar && <TesteSheet code={editar} atual={mapa.get(editar)} onClose={() => setEditar(null)} salvar={salvar} remover={remover} />}
    </div>
  );
}
function TesteSheet({ code, atual, onClose, salvar, remover }: { code: string; atual?: Check; onClose: () => void; salvar: (c: string, f: Partial<Check>) => Promise<boolean>; remover: (c: string) => Promise<boolean> }) {
  const teste = TESTES_RN.find((x) => x.code === code)!;
  const [f, setF] = useState({ date: atual?.date ?? ymd(Date.now()), value: atual?.value ?? 'normal', note: atual?.note ?? '' });
  return (
    <Sheet title={teste.nome} onClose={onClose} footer={<>
      {atual && <button className="btn danger" onClick={async () => (await remover(code)) && onClose()}><Trash2 size={16} /></button>}
      <button className="btn primary" onClick={async () => (await salvar(code, { date: f.date, value: f.value, note: f.note || null })) && onClose()}>Salvar</button>
    </>}>
      <p className="faint">{teste.quando}</p>
      <Field label="Data"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Resultado"><div className="choice">{RESULTADOS_TESTE.map((r) => <button type="button" key={r.v} className={f.value === r.v ? 'on' : ''} onClick={() => setF({ ...f, value: r.v })}>{r.l}</button>)}</div></Field>
      <Field label="Observação"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="ex.: refazer em 15 dias" /></Field>
    </Sheet>
  );
}

export function Alimentos() {
  const { data, agora, abrirRegistro, podeEditar } = useApp();
  const alim = data.checks.filter((c) => c.kind === 'alimento').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const meses = idade(data.baby.birth_date, agora).dias / 30.4;
  const nomes = new Set(alim.map((a) => (a.note ?? '').toLowerCase()));
  const reacoes = alim.filter((a) => a.value && !['Sem reação', 'boa', 'media', 'recusou', 'Recusou o alimento'].includes(a.value));
  return (
    <div className="card">
      <div className="card-h"><h2>🥕 Introdução alimentar</h2>{podeEditar && <button className="btn sm primary" onClick={() => abrirRegistro('alimentacao')}><Plus size={14} /> Registrar refeição</button>}</div>
      {meses < 6 && <p className="faint" style={{ marginBottom: 8 }}>Até os 6 meses a recomendação é leite materno exclusivo (ou fórmula, se indicada). A introdução alimentar começa por volta dos 6 meses, com orientação do pediatra.</p>}
      {reacoes.length > 0 && <div className="chip bad" style={{ whiteSpace: 'normal', marginBottom: 10 }}>⚠️ Reação registrada: {reacoes.map((r) => `${r.note} (${r.value})`).join('; ')}. Mostre ao pediatra.</div>}
      <h3 style={{ margin: '6px 0' }}>Alimentos que mais causam alergia</h3>
      <div className="wrap-row" style={{ marginBottom: 10 }}>
        {ALERGENOS.map((a) => <span key={a} className={`chip ${nomes.has(a.toLowerCase()) ? 'ok' : ''}`}>{nomes.has(a.toLowerCase()) ? '✓ ' : ''}{a}</span>)}
      </div>
      <h3 style={{ margin: '6px 0' }}>Já oferecidos ({alim.length})</h3>
      {alim.length ? alim.map((a) => (
        <div key={a.id} className="list-item">
          <div className="grow"><b>{a.note}</b><div className="faint">primeira vez em {a.date ? dataBr(a.date) : '—'}{a.value ? ` · ${a.value}` : ''}</div></div>
        </div>
      )) : <Empty emoji="🥣">Ao registrar uma refeição, marque “primeira vez” para o alimento aparecer aqui.</Empty>}
      <p className="disclaimer">Ofereça um alimento novo por vez e observe por alguns dias (SBP / Guia Alimentar para Crianças Menores de 2 Anos).</p>
    </div>
  );
}
