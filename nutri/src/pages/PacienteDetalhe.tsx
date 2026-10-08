import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Archive, ArrowLeft, CalendarPlus, MessageCircle, Package, Pencil, Ruler, Save, Trash2, Wallet } from 'lucide-react';
import { useStore } from '../store/Store';
import { Badge, Confirm, Empty, PageHeader, RowMenu } from '../components/ui';
import { AvaliacaoModal, ConsultaModal, PacienteModal, PacoteModal, saldoPacote } from '../components/modais';
import { Field, toNumber } from '../components/fields';
import PlanoAlimentarTab from '../components/PlanoAlimentar';
import type { Anamnese, Avaliacao, Consulta } from '../types';
import { date, money, pct } from '../utils/format';
import { linkWhatsApp, primeiroNome } from '../utils/metrics';
import { calcularMetas, classeImc, evolucao, idade, imc, pesoSaudavel, progressoMeta } from '../utils/nutri';

type Aba = 'evolucao' | 'plano' | 'anamnese' | 'consultas';

const CAMPOS_ANAMNESE: [keyof Anamnese, string][] = [
  ['queixa', 'Queixa principal / motivo da consulta'], ['patologias', 'Patologias e histórico clínico'], ['medicamentos', 'Medicamentos e suplementos'],
  ['alergias', 'Alergias e intolerâncias'], ['intestino', 'Hábito intestinal'], ['sono', 'Sono'], ['alcool', 'Consumo de álcool'],
  ['rotina', 'Rotina (trabalho, horários, quem cozinha)'], ['preferencias', 'Preferências alimentares'], ['aversoes', 'Aversões'],
];

export default function PacienteDetalhe() {
  const { id } = useParams();
  const { db, resumo, upsert, remove, toast } = useStore();
  const nav = useNavigate();
  const p = db.pacientes.find((x) => x.id === id);
  const [aba, setAba] = useState<Aba>('evolucao');
  const [modal, setModal] = useState<null | 'editar' | 'consulta' | 'avaliacao' | 'pacote' | 'arquivar'>(null);
  const [editAv, setEditAv] = useState<Avaliacao | undefined>();
  const [editCon, setEditCon] = useState<Consulta | undefined>();
  const [delAv, setDelAv] = useState<Avaliacao | null>(null);
  const [anam, setAnam] = useState<Anamnese | null>(null);

  const avs = useMemo(() => db.avaliacoes.filter((a) => a.pacienteId === id), [db.avaliacoes, id]);
  const ev = useMemo(() => evolucao(avs), [avs]);
  const cons = useMemo(() => db.consultas.filter((c) => c.pacienteId === id).sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora)), [db.consultas, id]);
  const pacs = db.pacotes.filter((x) => x.pacienteId === id);

  if (!p) return <div className="card"><Empty text="Paciente não encontrado." /><div className="right" style={{ padding: 16 }}><Link to="/pacientes">Voltar</Link></div></div>;

  const r = resumo.get(p.id)!;
  const ultima = ev.ultima;
  const vImc = ultima ? imc(ultima.peso, p.alturaCm) : 0;
  const cls = classeImc(vImc);
  const prog = progressoMeta(ev.primeira?.peso, ultima?.peso, p.pesoMeta);
  const metas = ultima ? calcularMetas(p, ultima.peso) : null;
  const [sMin, sMax] = pesoSaudavel(p.alturaCm);
  const anamnese = anam ?? p.anamnese;
  // Para hipertrofia/gestação ganhar peso é o esperado; nos demais objetivos a cor acompanha a perda
  const ganhar = p.pesoMeta !== undefined && ev.primeira ? p.pesoMeta > ev.primeira.peso : p.objetivo === 'Hipertrofia' || p.objetivo === 'Gestação';
  const pendente = cons.filter((c) => c.status === 'Realizada' && !c.pago && c.valor > 0).reduce((s, c) => s + c.valor, 0) + pacs.filter((x) => !x.pago).reduce((s, x) => s + x.valor, 0);

  const serie = ev.ord.map((a) => ({ data: date(a.data).slice(0, 5) + '/' + a.data.slice(2, 4), Peso: a.peso, Gordura: a.gordura, Cintura: a.cintura }));

  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to="/pacientes" className="small row" style={{ display: 'inline-flex' }}><ArrowLeft size={14} /> Pacientes</Link></div>
      <PageHeader title={p.nome} subtitle={`${p.sexo === 'F' ? 'Feminino' : 'Masculino'} · ${idade(p.nascimento)} anos · ${p.alturaCm} cm · ${p.atividade} · ${p.telefone}`}>
        <a className="btn wa" href={linkWhatsApp(p.telefone, `Olá, ${primeiroNome(p.nome)}!`)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>
        <button className="btn" onClick={() => setModal('editar')}><Pencil size={16} /> Editar</button>
        <button className="btn" onClick={() => { setEditAv(undefined); setModal('avaliacao'); }}><Ruler size={16} /> Nova avaliação</button>
        <button className="btn btn-primary" onClick={() => { setEditCon(undefined); setModal('consulta'); }}><CalendarPlus size={16} /> Agendar</button>
      </PageHeader>

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Badge>{r.status}</Badge><Badge tone="blue">{p.objetivo}</Badge><span className="chip">Origem: {p.origem}</span>
        {r.proxima && <span className="chip">Próxima consulta: {date(r.proxima.data)} às {r.proxima.hora}</span>}
        {pendente > 0 && <Badge tone="orange">{money(pendente)} pendente</Badge>}
      </div>

      <div className="stat-mini">
        <div><span>Peso atual {ultima && `(${date(ultima.data)})`}</span><b>{ultima ? `${ultima.peso.toFixed(1).replace('.', ',')} kg` : '—'}</b><span>Faixa saudável {sMin.toFixed(0)}–{sMax.toFixed(0)} kg</span></div>
        <div><span>IMC</span><b>{vImc ? vImc.toFixed(1).replace('.', ',') : '—'}</b><Badge tone={cls.tone}>{cls.label}</Badge></div>
        <div>
          <span>Evolução desde {ev.primeira ? date(ev.primeira.data) : '—'}</span>
          <b className={!ev.deltaTotal ? '' : (ev.deltaTotal > 0) === ganhar ? 'text-success' : 'text-warning'}>{ev.ord.length >= 2 ? `${ev.deltaTotal > 0 ? '+' : ''}${ev.deltaTotal.toFixed(1).replace('.', ',')} kg` : '—'}</b>
          {prog !== null && <><div className="meter"><span style={{ width: `${prog * 100}%` }} /></div><span>{pct(prog)} da meta de {p.pesoMeta} kg</span></>}
        </div>
        <div><span>Necessidade estimada (Mifflin)</span><b>{metas ? `${metas.kcal.toLocaleString('pt-BR')} kcal` : '—'}</b>{metas && <span>GET {Math.round(metas.get).toLocaleString('pt-BR')} · água {metas.agua.toFixed(1).replace('.', ',')} L</span>}</div>
      </div>

      <div className="card mt">
        <div className="tabs">
          {([['evolucao', 'Evolução'], ['plano', 'Plano alimentar'], ['anamnese', 'Anamnese'], ['consultas', 'Consultas e pagamentos']] as [Aba, string][]).map(([k, l]) => (
            <button key={k} className={`tab ${aba === k ? 'active' : ''}`} onClick={() => setAba(k)}>{l}</button>
          ))}
        </div>

        {aba === 'evolucao' && (
          ev.ord.length === 0 ? <Empty text="Nenhuma avaliação registrada. Clique em “Nova avaliação”." /> : (
            <>
              <div className="grid g-2" style={{ padding: 16 }}>
                <div>
                  <div className="strong small" style={{ padding: '0 0 6px 8px' }}>Peso (kg){p.pesoMeta ? ` · meta ${p.pesoMeta} kg` : ''}</div>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer>
                      <LineChart data={serie} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e4e9f1" />
                        <XAxis dataKey="data" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} width={40} />
                        <Tooltip />
                        {p.pesoMeta && <ReferenceLine y={p.pesoMeta} stroke="#d97706" strokeDasharray="4 4" />}
                        <Line type="monotone" dataKey="Peso" stroke="#0f8a63" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <div className="strong small" style={{ padding: '0 0 6px 8px' }}>% de gordura e cintura (cm)</div>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer>
                      <LineChart data={serie} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e4e9f1" />
                        <XAxis dataKey="data" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="g" fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} width={36} />
                        <YAxis yAxisId="c" orientation="right" fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 3', 'dataMax + 3']} width={36} />
                        <Tooltip />
                        <Line yAxisId="g" type="monotone" dataKey="Gordura" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line yAxisId="c" type="monotone" dataKey="Cintura" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead><tr><th>Data</th><th className="num">Peso</th><th className="num">Variação</th><th className="num">IMC</th><th className="num">% gordura</th><th className="num">Cintura</th><th className="num">Quadril</th><th>Obs.</th><th /></tr></thead>
                  <tbody>
                    {[...ev.ord].reverse().map((a, i, arr) => {
                      const ant = arr[i + 1];
                      const d = ant ? a.peso - ant.peso : null;
                      return (
                        <tr key={a.id}>
                          <td className="strong">{date(a.data)}</td>
                          <td className="num">{a.peso.toFixed(1).replace('.', ',')} kg</td>
                          <td className="num">{d === null ? '—' : <span className={d < 0 ? 'text-success' : d > 0 ? 'text-warning' : ''}>{d > 0 ? '+' : ''}{d.toFixed(1).replace('.', ',')}</span>}</td>
                          <td className="num">{imc(a.peso, p.alturaCm).toFixed(1).replace('.', ',')}</td>
                          <td className="num">{a.gordura?.toFixed(1).replace('.', ',') ?? '—'}</td>
                          <td className="num">{a.cintura ?? '—'}</td>
                          <td className="num">{a.quadril ?? '—'}</td>
                          <td className="sub">{a.obs}</td>
                          <td className="right"><RowMenu actions={[
                            { label: <><Pencil size={14} /> Editar</>, onClick: () => { setEditAv(a); setModal('avaliacao'); } },
                            { label: <><Trash2 size={14} /> Excluir</>, onClick: () => setDelAv(a), danger: true },
                          ]} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {aba === 'plano' && <PlanoAlimentarTab paciente={p} pesoAtual={ultima?.peso} />}

        {aba === 'anamnese' && (
          <form className="form-grid" style={{ padding: 20 }} onSubmit={(e) => { e.preventDefault(); upsert('pacientes', { ...p, anamnese }); setAnam(null); toast('Anamnese salva.'); }}>
            {CAMPOS_ANAMNESE.map(([k, l]) => (
              <Field key={k} label={l} full={k === 'queixa' || k === 'rotina'}>
                <textarea className="textarea" style={{ minHeight: 60 }} value={String(anamnese[k] ?? '')} onChange={(e) => setAnam({ ...anamnese, [k]: e.target.value })} />
              </Field>
            ))}
            <Field label="Consumo de água (L/dia)" hint={metas ? `Recomendado ≈ ${metas.agua.toFixed(1).replace('.', ',')} L (35 ml/kg)` : undefined}>
              <input className="input" inputMode="decimal" value={anamnese.aguaLitros || ''} onChange={(e) => setAnam({ ...anamnese, aguaLitros: toNumber(e.target.value) })} />
            </Field>
            <Field label="Observações gerais" full><textarea className="textarea" value={p.observacoes} onChange={(e) => upsert('pacientes', { ...p, observacoes: e.target.value })} /></Field>
            <div className="full row" style={{ justifyContent: 'flex-end' }}>
              {anam && <span className="small muted">Alterações não salvas</span>}
              <button className="btn btn-primary" type="submit" disabled={!anam}><Save size={16} /> Salvar anamnese</button>
            </div>
          </form>
        )}

        {aba === 'consultas' && (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div className="small muted">{r.realizadas} realizadas · {r.faltas} falta(s) · receita total {money(r.receita)}</div>
              <div className="row">
                <button className="btn" onClick={() => setModal('pacote')}><Package size={16} /> Vender pacote</button>
                <button className="btn" onClick={() => setModal('arquivar')}><Archive size={16} /> {p.arquivado ? 'Reativar' : 'Arquivar'}</button>
              </div>
            </div>
            {pacs.length > 0 && (
              <div className="insights" style={{ paddingTop: 0 }}>
                {pacs.map((x) => {
                  const saldo = saldoPacote(x, db.consultas);
                  return (
                    <div key={x.id} className="insight opp">
                      <div className="ico tone-blue"><Package size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="t">{x.nome} · {money(x.valor)}</div>
                        <div className="d">Vendido em {date(x.data)} · {x.consultas - saldo} de {x.consultas} consultas usadas · saldo {saldo} {x.pago ? '' : '· pagamento pendente'}</div>
                      </div>
                      {!x.pago && <button className="btn btn-sm" onClick={() => { upsert('pacotes', { ...x, pago: true }); toast('Pagamento registrado.'); }}><Wallet size={14} /> Receber</button>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th className="num">Valor</th><th>Pagamento</th><th /></tr></thead>
                <tbody>
                  {cons.map((c) => (
                    <tr key={c.id}>
                      <td className="strong">{date(c.data)} <span className="sub">{c.hora}</span></td>
                      <td>{c.tipo}</td>
                      <td><Badge>{c.status}</Badge></td>
                      <td className="num">{c.pacoteId ? <span className="muted">pacote</span> : money(c.valor)}</td>
                      <td>{c.status !== 'Realizada' || c.valor === 0 ? <span className="muted">—</span> : <Badge>{c.pago ? 'Pago' : 'Pendente'}</Badge>} <span className="sub">{c.status === 'Realizada' && c.valor > 0 ? c.forma : ''}</span></td>
                      <td className="right"><RowMenu actions={[
                        { label: <><Wallet size={14} /> Registrar pagamento</>, onClick: () => { upsert('consultas', { ...c, pago: true }); toast('Pagamento registrado.'); }, hidden: c.pago || c.status !== 'Realizada' || c.valor === 0 },
                        { label: <><Pencil size={14} /> Editar</>, onClick: () => { setEditCon(c); setModal('consulta'); } },
                      ]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cons.length === 0 && <Empty text="Nenhuma consulta registrada." />}
            </div>
          </>
        )}
      </div>

      {modal === 'editar' && <PacienteModal paciente={p} onClose={() => setModal(null)} />}
      {modal === 'consulta' && <ConsultaModal consulta={editCon} pacienteId={p.id} onClose={() => setModal(null)} />}
      {modal === 'avaliacao' && <AvaliacaoModal paciente={p} avaliacao={editAv} onClose={() => setModal(null)} />}
      {modal === 'pacote' && <PacoteModal pacienteId={p.id} onClose={() => setModal(null)} />}
      {modal === 'arquivar' && (
        <Confirm label={p.arquivado ? 'Reativar' : 'Arquivar'} onClose={() => setModal(null)}
          text={p.arquivado ? 'Reativar este paciente?' : 'Arquivar este paciente? Ele sai das listas e alertas, mas o histórico é mantido.'}
          onConfirm={() => { upsert('pacientes', { ...p, arquivado: !p.arquivado }); toast(p.arquivado ? 'Paciente reativado.' : 'Paciente arquivado.'); if (!p.arquivado) nav('/pacientes'); }} />
      )}
      {delAv && <Confirm text={`Excluir a avaliação de ${date(delAv.data)}?`} onClose={() => setDelAv(null)} onConfirm={() => { remove('avaliacoes', delAv.id); toast('Avaliação excluída.'); }} />}
    </>
  );
}
