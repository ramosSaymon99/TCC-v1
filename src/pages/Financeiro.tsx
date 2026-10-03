import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Download, Plus, Trash2, Wallet } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import type { Lancamento } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, Trend, useSortPage } from '../components/ui';
import { ClienteSelect, Field, Options, toNumber } from '../components/fields';
import { addDays, date, diffDays, downloadCSV, money, moneyShort, monthKey, monthLabel, normalize, parseDate, pct, toISODate, today, uid, variation } from '../utils/format';
import { resumoPeriodo } from '../utils/metrics';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA } from '../store/seed';

const CORES = ['#1e6fe8', '#12336d', '#7fb2f6', '#f59e0b', '#16a34a', '#94a3b8'];

export default function Financeiro() {
  const { db, upsert, remove, toast } = useStore();
  const nome = useClienteNome();
  const [params] = useSearchParams();
  const hoje = today();
  const [de, setDe] = useState(() => `${hoje.slice(0, 7)}-01`);
  const [ate, setAte] = useState(hoje);
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [deleting, setDeleting] = useState<Lancamento | null>(null);

  // Período anterior equivalente (mesmo nº de dias imediatamente antes)
  const dias = diffDays(ate, de) + 1;
  const antAte = addDays(de, -1);
  const antDe = addDays(antAte, -(dias - 1));
  const r = resumoPeriodo(db.lancamentos, de, ate);
  const ra = resumoPeriodo(db.lancamentos, antDe, antAte);

  const doPeriodo = db.lancamentos.filter((l) => l.data >= de && l.data <= ate);
  const serie = useMemo(() => {
    const porMes = dias > 62;
    const buckets = new Map<string, { label: string; Receitas: number; Despesas: number }>();
    const key = (iso: string) => {
      if (porMes) return monthKey(iso);
      const idx = Math.floor(diffDays(iso, de) / 5); // blocos de 5 dias
      return addDays(de, idx * 5);
    };
    // cria buckets vazios para manter o eixo contínuo
    if (porMes) {
      const a = parseDate(de), b = parseDate(ate);
      for (let dt = new Date(a.getFullYear(), a.getMonth(), 1); dt <= b; dt.setMonth(dt.getMonth() + 1)) {
        const k = toISODate(dt).slice(0, 7); buckets.set(k, { label: monthLabel(k), Receitas: 0, Despesas: 0 });
      }
    } else {
      for (let i = 0; i < dias; i += 5) { const k = addDays(de, i); buckets.set(k, { label: `${parseDate(k).getDate()}/${parseDate(k).getMonth() + 1}`, Receitas: 0, Despesas: 0 }); }
    }
    for (const l of doPeriodo) {
      const b = buckets.get(key(l.data)); if (!b) continue;
      if (l.tipo === 'Receita') b.Receitas += l.valor; else b.Despesas += l.valor;
    }
    return [...buckets.values()];
  }, [doPeriodo, de, ate, dias]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    doPeriodo.filter((l) => l.tipo === 'Despesa').forEach((l) => m.set(l.categoria, (m.get(l.categoria) ?? 0) + l.valor));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [doPeriodo]);

  const aReceber = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.status === 'Pendente');
  const aPagar = db.lancamentos.filter((l) => l.tipo === 'Despesa' && l.status === 'Pendente');

  const rows = doPeriodo.filter((l) =>
    (!tipo || l.tipo === tipo) && (!status || l.status === status) &&
    (!q || normalize(`${l.descricao} ${l.categoria} ${nome(l.clienteId)}`).includes(normalize(q))));
  // Pendências são exibidas mesmo fora do período quando o filtro "Pendente" está ativo
  const lista = status === 'Pendente' ? db.lancamentos.filter((l) => l.status === 'Pendente' && (!tipo || l.tipo === tipo)) : rows;
  const s = useSortPage<Lancamento>(lista, 10, { key: 'data', dir: 'desc' });

  const atalho = (k: 'mes' | 'ant' | '3m' | '12m') => {
    const d = parseDate(hoje);
    if (k === 'mes') { setDe(`${hoje.slice(0, 7)}-01`); setAte(hoje); }
    if (k === 'ant') { const a = new Date(d.getFullYear(), d.getMonth() - 1, 1); setDe(toISODate(a)); setAte(toISODate(new Date(d.getFullYear(), d.getMonth(), 0))); }
    if (k === '3m') { setDe(toISODate(new Date(d.getFullYear(), d.getMonth() - 2, 1))); setAte(hoje); }
    if (k === '12m') { setDe(toISODate(new Date(d.getFullYear(), d.getMonth() - 11, 1))); setAte(hoje); }
  };

  return (
    <>
      <PageHeader title="Financeiro" subtitle={`Receitas, despesas e lucro. Comparação com os ${dias} dias anteriores (${date(antDe)} a ${date(antAte)}).`}>
        <input className="input" type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} style={{ width: 150 }} />
        <span className="muted">até</span>
        <input className="input" type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} style={{ width: 150 }} />
        <button className="btn" onClick={() => downloadCSV(`financeiro_${de}_${ate}.csv`, [
          ['Data', 'Tipo', 'Descrição', 'Categoria', 'Cliente', 'Status', 'Valor'],
          ...rows.map((l) => [date(l.data), l.tipo, l.descricao, l.categoria, nome(l.clienteId), l.status, l.valor.toFixed(2).replace('.', ',')]),
        ])}><Download size={16} /> Exportar</button>
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), tipo: 'Receita', descricao: '', categoria: 'Manutenção', valor: 0, data: hoje, status: 'Pago' })}><Plus size={16} /> Lançamento</button>
      </PageHeader>

      <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="small muted">Atalhos:</span>
        <button className="btn btn-sm" onClick={() => atalho('mes')}>Mês atual</button>
        <button className="btn btn-sm" onClick={() => atalho('ant')}>Mês anterior</button>
        <button className="btn btn-sm" onClick={() => atalho('3m')}>Últimos 3 meses</button>
        <button className="btn btn-sm" onClick={() => atalho('12m')}>Últimos 12 meses</button>
      </div>

      <div className="grid kpis">
        <Kpi icon={<ArrowUpCircle size={20} />} tone="green" label="Receitas" value={money(r.faturamento)} foot={<><Trend value={variation(r.faturamento, ra.faturamento)} /> · {r.vendas} vendas · ticket {moneyShort(r.ticket)}</>} />
        <Kpi icon={<ArrowDownCircle size={20} />} tone="red" label="Despesas" value={money(r.despesas)} foot={<><Trend value={variation(r.despesas, ra.despesas)} invert /> · {pct(r.faturamento ? r.despesas / r.faturamento : 0)} da receita</>} />
        <Kpi icon={<Wallet size={20} />} tone="blue" label="Lucro líquido" value={<span className={r.lucro < 0 ? 'text-danger' : ''}>{money(r.lucro)}</span>} foot={<><Trend value={variation(r.lucro, ra.lucro)} /> · margem {pct(r.margem)}</>} />
        <Kpi icon={<CheckCircle2 size={20} />} tone="orange" label="A receber / a pagar" value={money(aReceber.reduce((a, l) => a + l.valor, 0))}
          foot={`${aReceber.length} a receber · ${money(aPagar.reduce((a, l) => a + l.valor, 0))} a pagar`} />
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head"><h3>Receitas x Despesas</h3><span className="small muted">{dias > 62 ? 'por mês' : 'blocos de 5 dias'}</span></div>
          <div className="chart-box" style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={(v) => moneyShort(v)} tickLine={false} axisLine={false} fontSize={11} width={92} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: '#f3f7fe' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receitas" fill="#1e6fe8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Despesas" fill="#9cc2f7" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Despesas por categoria</h3></div>
          {porCategoria.length ? (
            <div className="row" style={{ padding: '10px 20px 18px', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 170, height: 170, position: 'relative' }}>
                <PieChart width={170} height={170}>
                  <Pie data={porCategoria} dataKey="value" cx={85} cy={85} innerRadius={55} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {porCategoria.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                  </Pie>
                </PieChart>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                  <div><div className="strong">{moneyShort(r.despesas)}</div><div className="small muted">total</div></div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                {porCategoria.map((c, i) => (
                  <div key={c.name} className="row between small" style={{ padding: '5px 0' }}>
                    <span className="row"><i style={{ width: 10, height: 10, borderRadius: 3, background: CORES[i % CORES.length], display: 'inline-block' }} />{c.name}</span>
                    <span><span className="muted">{moneyShort(c.value)}</span> <strong>{pct(c.value / r.despesas)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <Empty text="Sem despesas no período." />}
        </div>
      </div>

      <div className="card mt">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por descrição, categoria ou cliente..." />
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Receitas e despesas</option><Options items={['Receita', 'Despesa'] as const} /></select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option><Options items={['Pago', 'Pendente'] as const} /></select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Data" k="data" s={s} />
                <Th label="Descrição" k="descricao" s={s} />
                <Th label="Categoria" k="categoria" s={s} className="hide-sm" />
                <th className="hide-sm">Cliente</th>
                <Th label="Tipo" k="tipo" s={s} />
                <Th label="Status" k="status" s={s} />
                <Th label="Valor" k="valor" s={s} className="num" />
                <th />
              </tr>
            </thead>
            <tbody>
              {s.view.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{date(l.data)}</td>
                  <td className="strong">{l.descricao}</td>
                  <td className="hide-sm">{l.categoria}</td>
                  <td className="hide-sm">{nome(l.clienteId)}</td>
                  <td><Badge>{l.tipo}</Badge></td>
                  <td><Badge>{l.status}</Badge></td>
                  <td className={`num strong ${l.tipo === 'Despesa' ? 'text-danger' : ''}`}>{l.tipo === 'Despesa' ? '−' : ''}{money(l.valor)}</td>
                  <td className="right">
                    <RowMenu actions={[
                      { label: <><CheckCircle2 size={14} /> Marcar como pago</>, hidden: l.status === 'Pago', onClick: () => { upsert('lancamentos', { ...l, status: 'Pago' }); toast('Lançamento baixado.'); } },
                      { label: 'Editar', onClick: () => setEditing(l) },
                      { label: <><Trash2 size={14} /> Excluir</>, danger: true, onClick: () => setDeleting(l) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhum lançamento no período." />}
        </div>
        <Pager {...s} noun="lançamentos" />
      </div>

      {editing && <LancForm l={editing} onClose={() => setEditing(null)} onSave={(l) => {
        if (!l.descricao || l.valor <= 0) return toast('Informe descrição e valor maior que zero.', 'error');
        upsert('lancamentos', l); toast('Lançamento salvo.'); setEditing(null);
      }} />}
      {deleting && <Confirm text={<>Excluir o lançamento <strong>{deleting.descricao}</strong> de {money(deleting.valor)}?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('lancamentos', deleting.id); toast('Lançamento excluído.'); }} />}
    </>
  );
}

function LancForm({ l, onClose, onSave }: { l: Lancamento; onClose: () => void; onSave: (l: Lancamento) => void }) {
  const [f, setF] = useState(l);
  const set = <K extends keyof Lancamento>(k: K, v: Lancamento[K]) => setF((x) => ({ ...x, [k]: v }));
  const cats = f.tipo === 'Receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  return (
    <Modal title={l.descricao ? 'Editar lançamento' : 'Novo lançamento'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="lanc-form">Salvar</button>
    </>}>
      <form id="lanc-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Tipo">
          <select className="select" value={f.tipo} onChange={(e) => { const t = e.target.value as Lancamento['tipo']; setF((x) => ({ ...x, tipo: t, categoria: t === 'Receita' ? CATEGORIAS_RECEITA[0] : CATEGORIAS_DESPESA[0] })); }}>
            <Options items={['Receita', 'Despesa'] as const} />
          </select>
        </Field>
        <Field label="Categoria"><select className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value)}><Options items={cats} /></select></Field>
        <Field label="Descrição" full><input className="input" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} required /></Field>
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" defaultValue={f.valor ? String(f.valor).replace('.', ',') : ''} onChange={(e) => set('valor', toNumber(e.target.value))} required /></Field>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} required /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Lancamento['status'])}><Options items={['Pago', 'Pendente'] as const} /></select></Field>
        {f.tipo === 'Receita' && <Field label="Cliente"><ClienteSelect allowEmpty value={f.clienteId} onChange={(v) => set('clienteId', v || undefined)} /></Field>}
      </form>
    </Modal>
  );
}
