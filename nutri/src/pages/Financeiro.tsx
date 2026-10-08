import { useMemo, useState, type FormEvent } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, DollarSign, Download, Pencil, Plus, Receipt, Scale, Trash2, TrendingDown, Wallet } from 'lucide-react';
import { useStore } from '../store/Store';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, RowMenu, Trend } from '../components/ui';
import { Field, Options, toNumber } from '../components/fields';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, ORIGENS, TIPOS_CONSULTA, type Lancamento, type Origem } from '../types';
import { addDays, date, diffDays, downloadCSV, lastMonths, monthLabel, money, moneyShort, pct, today, uid, variation } from '../utils/format';
import { aReceber, despesas, faturamento, fimMes, FONTES, inicioMes, mesAnterior, noPeriodo, periodoEquivalenteAnterior, type Recebivel } from '../utils/metrics';

type Periodo = 'mes' | 'anterior' | '3m' | '12m' | 'custom';

function LancamentoModal({ lanc, onClose }: { lanc?: Lancamento; onClose: () => void }) {
  const { upsert, toast } = useStore();
  const [f, setF] = useState<Lancamento>(lanc ?? { id: uid(), data: today(), tipo: 'Despesa', categoria: CATEGORIAS_DESPESA[0], descricao: '', valor: 0, pago: true });
  const set = <K extends keyof Lancamento>(k: K, v: Lancamento[K]) => setF((x) => ({ ...x, [k]: v }));
  const cats = f.tipo === 'Despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA;
  const salvar = (e: FormEvent) => { e.preventDefault(); upsert('lancamentos', { ...f, canal: f.tipo === 'Despesa' && f.categoria === 'Marketing' ? f.canal : undefined }); toast('Lançamento salvo.'); onClose(); };
  return (
    <Modal title={lanc ? 'Editar lançamento' : 'Novo lançamento'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" type="submit" form="f-lan">Salvar</button>
    </>}>
      <form id="f-lan" className="form-grid" onSubmit={salvar}>
        <Field label="Tipo"><select className="select" value={f.tipo} onChange={(e) => { const t = e.target.value as Lancamento['tipo']; setF((x) => ({ ...x, tipo: t, categoria: (t === 'Despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA)[0] })); }}><option>Despesa</option><option>Receita</option></select></Field>
        <Field label="Categoria"><select className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value)}><Options items={cats} /></select></Field>
        <Field label="Descrição" full><input className="input" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} required /></Field>
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={f.valor || ''} onChange={(e) => set('valor', toNumber(e.target.value))} required /></Field>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} required /></Field>
        {f.tipo === 'Despesa' && f.categoria === 'Marketing' && (
          <Field label="Canal de captação" full hint="Permite calcular custo por paciente (CAC) e retorno por canal na tela de Captação.">
            <select className="select" value={f.canal ?? ''} onChange={(e) => set('canal', (e.target.value || undefined) as Origem | undefined)}><option value="">Não se aplica</option><Options items={ORIGENS} /></select>
          </Field>
        )}
        <Field label="Situação"><label className="check" style={{ height: 36 }}><input type="checkbox" checked={f.pago} onChange={(e) => set('pago', e.target.checked)} /> {f.tipo === 'Despesa' ? 'Pago' : 'Recebido'}</label></Field>
      </form>
    </Modal>
  );
}

export default function Financeiro() {
  const { db, upsert, remove, toast } = useStore();
  const hoje = today();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [custom, setCustom] = useState({ de: inicioMes(hoje), ate: hoje });
  const [modal, setModal] = useState<Lancamento | 'novo' | null>(null);
  const [del, setDel] = useState<Lancamento | null>(null);

  const { de, ate } = useMemo(() => {
    switch (periodo) {
      case 'mes': return { de: inicioMes(hoje), ate: hoje };
      case 'anterior': { const d = mesAnterior(hoje); return { de: d, ate: fimMes(d) }; }
      case '3m': return { de: addDays(hoje, -90), ate: hoje };
      case '12m': return { de: addDays(hoje, -364), ate: hoje };
      default: return custom;
    }
  }, [periodo, custom, hoje]);
  const dur = diffDays(ate, de) + 1;
  // Mês corrente: mesmos dias do mês anterior; mês fechado: mês fechado anterior; demais: período imediatamente anterior
  const { de: antDe, ate: antAte } = periodo === 'mes' ? periodoEquivalenteAnterior(hoje)
    : periodo === 'anterior' ? { de: mesAnterior(de), ate: fimMes(mesAnterior(de)) }
    : { de: addDays(de, -dur), ate: addDays(de, -1) };

  const fat = faturamento(db, de, ate), fatAnt = faturamento(db, antDe, antAte);
  const desp = despesas(db, de, ate), despAnt = despesas(db, antDe, antAte);
  const resultado = fat.total - desp.total;
  const margem = fat.total ? resultado / fat.total : 0;
  const receber = aReceber(db, hoje);
  const totalReceber = receber.reduce((s, r) => s + r.valor, 0);

  // Efeito volume × preço por tipo de consulta
  const porTipo = TIPOS_CONSULTA.map((t) => {
    const q = (a: string, b: string) => db.consultas.filter((c) => c.tipo === t && c.status === 'Realizada' && c.valor > 0 && noPeriodo(c.data, a, b));
    const at = q(de, ate), an = q(antDe, antAte);
    const r1 = at.reduce((s, c) => s + c.valor, 0), r0 = an.reduce((s, c) => s + c.valor, 0);
    const t1 = at.length ? r1 / at.length : 0, t0 = an.length ? r0 / an.length : 0;
    return { tipo: t, q1: at.length, q0: an.length, t1, r1, r0, volume: (at.length - an.length) * t0, preco: an.length && at.length ? (t1 - t0) * at.length : 0 };
  });

  // Ponto de equilíbrio com despesas médias dos últimos 3 meses
  const despMedia = despesas(db, addDays(hoje, -90), hoje).total / 3;
  const consultas90 = db.consultas.filter((c) => c.status === 'Realizada' && c.valor > 0 && noPeriodo(c.data, addDays(hoje, -90), hoje));
  const ticket90 = consultas90.length ? consultas90.reduce((s, c) => s + c.valor, 0) / consultas90.length : db.config.precos.Retorno;
  const equilibrio = Math.ceil(despMedia / ticket90);

  const serie = lastMonths(12).map((m) => {
    const a = `${m}-01`, b = fimMes(a) > hoje ? hoje : fimMes(a);
    const r = faturamento(db, a, b).total, d = despesas(db, a, b).total;
    return { mes: monthLabel(m), Receita: r, Despesa: d, Resultado: r - d };
  });

  const lancs = db.lancamentos.filter((l) => noPeriodo(l.data, de, ate)).sort((a, b) => b.data.localeCompare(a.data));
  const pacNome = (id?: string) => db.pacientes.find((p) => p.id === id)?.nome ?? '';
  const receberItem = (r: Recebivel) => {
    if (r.tipo === 'consulta') { const c = db.consultas.find((x) => x.id === r.id); if (c) upsert('consultas', { ...c, pago: true }); }
    else if (r.tipo === 'pacote') { const p = db.pacotes.find((x) => x.id === r.id); if (p) upsert('pacotes', { ...p, pago: true }); }
    else { const l = db.lancamentos.find((x) => x.id === r.id); if (l) upsert('lancamentos', { ...l, pago: true }); }
    toast('Recebimento registrado.');
  };

  const exportar = () => downloadCSV(`financeiro_${de}_${ate}.csv`, [
    ['Data', 'Tipo', 'Categoria', 'Descrição', 'Paciente', 'Valor', 'Situação'],
    ...db.consultas.filter((c) => c.status === 'Realizada' && c.valor > 0 && noPeriodo(c.data, de, ate)).map((c) => [date(c.data), 'Receita', c.tipo, 'Consulta', pacNome(c.pacienteId), c.valor.toFixed(2), c.pago ? 'Pago' : 'Pendente']),
    ...db.pacotes.filter((p) => noPeriodo(p.data, de, ate)).map((p) => [date(p.data), 'Receita', 'Pacote', p.nome, pacNome(p.pacienteId), p.valor.toFixed(2), p.pago ? 'Pago' : 'Pendente']),
    ...lancs.map((l) => [date(l.data), l.tipo, l.categoria, l.descricao, '', (l.tipo === 'Despesa' ? -l.valor : l.valor).toFixed(2), l.pago ? 'Pago' : 'Pendente']),
  ]);

  return (
    <>
      <PageHeader title="Financeiro" subtitle={`${date(de)} a ${date(ate)} · comparado com ${date(antDe)} a ${date(antAte)}`}>
        <div className="seg">
          {([['mes', 'Este mês'], ['anterior', 'Mês anterior'], ['3m', '90 dias'], ['12m', '12 meses'], ['custom', 'Período']] as [Periodo, string][]).map(([k, l]) => (
            <button key={k} className={periodo === k ? 'active' : ''} onClick={() => setPeriodo(k)}>{l}</button>
          ))}
        </div>
        {periodo === 'custom' && <>
          <input className="input" type="date" value={custom.de} onChange={(e) => setCustom({ ...custom, de: e.target.value })} style={{ width: 150 }} />
          <input className="input" type="date" value={custom.ate} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} style={{ width: 150 }} />
        </>}
        <button className="btn" onClick={exportar}><Download size={16} /> CSV</button>
        <button className="btn btn-primary" onClick={() => setModal('novo')}><Plus size={16} /> Lançamento</button>
      </PageHeader>

      <div className="grid kpis">
        <Kpi icon={<DollarSign size={20} />} tone="green" label="Faturamento" value={moneyShort(fat.total)} foot={<><Trend value={variation(fat.total, fatAnt.total)} /> vs. {moneyShort(fatAnt.total)}</>} />
        <Kpi icon={<TrendingDown size={20} />} tone="red" label="Despesas" value={moneyShort(desp.total)} foot={<><Trend value={variation(desp.total, despAnt.total)} invert /> vs. {moneyShort(despAnt.total)}</>} />
        <Kpi icon={<Scale size={20} />} tone={resultado >= 0 ? 'blue' : 'red'} label="Resultado" value={moneyShort(resultado)} foot={<>Margem {pct(margem)}</>} />
        <Kpi icon={<Wallet size={20} />} tone="orange" label="A receber (total)" value={moneyShort(totalReceber)} foot={<>{receber.length} pendência(s)</>} />
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head"><div><h3>Receita, despesa e resultado — 12 meses</h3><div className="card-sub">Mês corrente parcial</div></div></div>
          <div className="chart-box" style={{ height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#efe9dc" />
                <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => moneyShort(Number(v))} width={78} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="Receita" fill="#2f6b4f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesa" fill="#f4b9a3" radius={[4, 4, 0, 0]} />
                <Line dataKey="Resultado" stroke="#1d2a22" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontSize: 14.5 }}>Ponto de equilíbrio</h3>
          <div className="card-sub">Despesa média dos últimos 3 meses ÷ ticket médio das consultas</div>
          <div className="stat-mini" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
            <div><span>Despesa média/mês</span><b>{money(despMedia)}</b></div>
            <div><span>Ticket médio (90 dias)</span><b>{money(ticket90)}</b></div>
          </div>
          <p style={{ marginBottom: 0 }}>São necessárias <b>{equilibrio} consultas pagas por mês</b> para cobrir os custos. Nos últimos 90 dias a média foi de <b>{Math.round(consultas90.length / 3)}</b> ({pct(consultas90.length / 3 / Math.max(1, equilibrio))} do equilíbrio).</p>
          <div className="divider" />
          <h3 style={{ fontSize: 14.5, marginBottom: 8 }}>Despesas por categoria</h3>
          {Object.entries(desp.porCategoria).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <div key={c} style={{ marginBottom: 8 }}>
              <div className="row between small"><span>{c}</span><span><b>{money(v)}</b> · {pct(v / (desp.total || 1))}</span></div>
              <div className="meter" style={{ marginTop: 4 }}><span style={{ width: `${(v / (desp.total || 1)) * 100}%`, background: '#e57373' }} /></div>
            </div>
          ))}
          {desp.total === 0 && <div className="muted small">Sem despesas no período.</div>}
        </div>
      </div>

      <div className="card mt">
        <div className="card-head"><div><h3>Receita por fonte e efeito volume × preço</h3><div className="card-sub">Explica a variação: mais/menos consultas (volume) ou ticket diferente (preço/mix de convênio)</div></div></div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table table-compact">
            <thead><tr><th>Fonte</th><th className="num">Qtd.</th><th className="num">Ticket</th><th className="num">Receita</th><th className="num">% do total</th><th className="num">Variação</th><th className="num">Efeito volume</th><th className="num">Efeito preço</th></tr></thead>
            <tbody>
              {FONTES.map((f) => {
                const t = porTipo.find((x) => x.tipo === f);
                const v = fat.porFonte[f], v0 = fatAnt.porFonte[f];
                return (
                  <tr key={f}>
                    <td className="strong">{f}</td>
                    <td className="num">{t ? <>{t.q1} <span className="sub">({t.q0})</span></> : '—'}</td>
                    <td className="num">{t && t.q1 ? money(t.t1) : '—'}</td>
                    <td className="num">{money(v)}</td>
                    <td className="num">{pct(v / (fat.total || 1))}</td>
                    <td className="num"><Trend value={variation(v, v0)} /></td>
                    <td className={`num ${t && t.volume < 0 ? 'text-danger' : ''}`}>{t ? money(t.volume) : '—'}</td>
                    <td className={`num ${t && t.preco < 0 ? 'text-danger' : ''}`}>{t ? money(t.preco) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><div><h3>A receber</h3><div className="card-sub">Consultas realizadas, pacotes e receitas sem baixa</div></div></div>
          {receber.length === 0 ? <div className="empty">Nada pendente. <CheckCircle2 size={16} /></div> : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table table-compact">
                <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th><th /></tr></thead>
                <tbody>
                  {receber.map((r) => (
                    <tr key={r.id}>
                      <td>{date(r.data)}<div className="sub">há {diffDays(hoje, r.data)} dias</div></td>
                      <td><div className="strong">{r.pacienteId ? pacNome(r.pacienteId) : r.descricao}</div>{r.pacienteId && <div className="sub">{r.descricao}</div>}</td>
                      <td className="num">{money(r.valor)}</td>
                      <td className="right"><button className="btn btn-sm" onClick={() => receberItem(r)}><Wallet size={14} /> Receber</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Lançamentos do período</h3><div className="card-sub">Despesas e outras receitas (consultas e pacotes entram automaticamente)</div></div></div>
          {lancs.length === 0 ? <Empty text="Nenhum lançamento no período." /> : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table table-compact">
                <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th><th /></tr></thead>
                <tbody>
                  {lancs.map((l) => (
                    <tr key={l.id}>
                      <td>{date(l.data)}</td>
                      <td><div className="strong">{l.descricao}</div><div className="sub">{l.categoria}{l.canal ? ` · ${l.canal}` : ''} {!l.pago && <Badge>Pendente</Badge>}</div></td>
                      <td className={`num ${l.tipo === 'Despesa' ? 'text-danger' : 'text-success'}`}>{l.tipo === 'Despesa' ? '−' : '+'}{money(l.valor)}</td>
                      <td className="right"><RowMenu actions={[
                        { label: <><Receipt size={14} /> Marcar como pago</>, onClick: () => { upsert('lancamentos', { ...l, pago: true }); toast('Baixa registrada.'); }, hidden: l.pago },
                        { label: <><Pencil size={14} /> Editar</>, onClick: () => setModal(l) },
                        { label: <><Trash2 size={14} /> Excluir</>, onClick: () => setDel(l), danger: true },
                      ]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && <LancamentoModal lanc={modal === 'novo' ? undefined : modal} onClose={() => setModal(null)} />}
      {del && <Confirm text={`Excluir “${del.descricao}”?`} onClose={() => setDel(null)} onConfirm={() => { remove('lancamentos', del.id); toast('Lançamento excluído.'); }} />}
    </>
  );
}
