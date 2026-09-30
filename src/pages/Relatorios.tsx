import { useState, type ReactNode } from 'react';
import { BarChart3, Download, FileBarChart, Lightbulb, PieChart, Printer, Repeat, TrendingUp, UserX, Users, Wrench, Filter } from 'lucide-react';
import { useStore } from '../store/Store';
import type { Database } from '../types';
import { Modal, PageHeader } from '../components/ui';
import { addDays, date, diffDays, downloadCSV, lastMonths, money, monthKey, monthLabel, parseDate, pct, toISODate, today, variation } from '../utils/format';
import { receitas, despesas, inRange, sum } from '../utils/metrics';

type Cell = string | number;
interface Built { columns: string[]; rows: Cell[][]; footer?: Cell[]; notes: string[] }
interface Report { id: string; title: string; desc: string; icon: ReactNode; build: (db: Database, p: Periodo) => Built }
interface Periodo { de: string; ate: string; antDe: string; antAte: string; label: string }

const v = (a: number, b: number) => { const x = variation(a, b); return x === null ? 'novo' : `${x >= 0 ? '+' : '−'}${pct(Math.abs(x), 1)}`; };

const REPORTS: Record<string, Report[]> = {
  Financeiro: [
    {
      id: 'dre', title: 'Demonstrativo de Resultados', desc: 'Receitas por serviço, despesas por categoria, lucro e margem vs. período anterior.', icon: <FileBarChart size={20} />,
      build: (db, p) => {
        const L = db.lancamentos;
        const rA = receitas(inRange(L, p.de, p.ate)), rB = receitas(inRange(L, p.antDe, p.antAte));
        const dA = despesas(inRange(L, p.de, p.ate)), dB = despesas(inRange(L, p.antDe, p.antAte));
        const cats = (xs: typeof L) => [...new Set(xs.map((x) => x.categoria))].sort();
        const tot = (xs: typeof L, c?: string) => sum(xs.filter((x) => !c || x.categoria === c).map((x) => x.valor));
        const rows: Cell[][] = [
          ['RECEITA BRUTA', money(tot(rA)), money(tot(rB)), v(tot(rA), tot(rB))],
          ...cats([...rA, ...rB]).map((c) => [`   ${c}`, money(tot(rA, c)), money(tot(rB, c)), v(tot(rA, c), tot(rB, c))]),
          ['(−) DESPESAS', money(tot(dA)), money(tot(dB)), v(tot(dA), tot(dB))],
          ...cats([...dA, ...dB]).map((c) => [`   ${c}`, money(tot(dA, c)), money(tot(dB, c)), v(tot(dA, c), tot(dB, c))]),
        ];
        const la = tot(rA) - tot(dA), lb = tot(rB) - tot(dB);
        const maiorDesp = cats(dA).map((c) => [c, tot(dA, c) - tot(dB, c)] as const).sort((a, b) => b[1] - a[1])[0];
        return {
          columns: ['Conta', 'Período atual', 'Período anterior', 'Variação'], rows,
          footer: ['LUCRO LÍQUIDO', money(la), money(lb), v(la, lb)],
          notes: [
            `Margem líquida: ${pct(tot(rA) ? la / tot(rA) : 0, 1)} (anterior: ${pct(tot(rB) ? lb / tot(rB) : 0, 1)}).`,
            maiorDesp && maiorDesp[1] > 0 ? `Maior aumento de despesa: ${maiorDesp[0]} (+${money(maiorDesp[1])}).` : 'Nenhuma categoria de despesa aumentou.',
          ],
        };
      },
    },
    {
      id: 'fluxo', title: 'Fluxo de Caixa', desc: 'Entradas, saídas e saldo acumulado mês a mês (últimos 12 meses).', icon: <Repeat size={20} />,
      build: (db) => {
        let acc = 0;
        const rows = lastMonths(12).map((m) => {
          const doMes = db.lancamentos.filter((l) => monthKey(l.data) === m && l.status === 'Pago');
          const e = sum(receitas(doMes).map((x) => x.valor)), s = sum(despesas(doMes).map((x) => x.valor));
          acc += e - s;
          return [monthLabel(m), money(e), money(s), money(e - s), money(acc)];
        });
        const pend = db.lancamentos.filter((l) => l.status === 'Pendente');
        return {
          columns: ['Mês', 'Entradas', 'Saídas', 'Saldo do mês', 'Saldo acumulado'], rows,
          notes: [
            'Considera somente lançamentos pagos (regime de caixa).',
            `Pendências fora do caixa: ${money(sum(receitas(pend).map((x) => x.valor)))} a receber e ${money(sum(despesas(pend).map((x) => x.valor)))} a pagar.`,
          ],
        };
      },
    },
  ],
  Clientes: [
    {
      id: 'abc', title: 'Faturamento por Cliente (Curva ABC)', desc: 'Participação e acumulado de cada cliente no faturamento do período.', icon: <Users size={20} />,
      build: (db, p) => {
        const rA = receitas(inRange(db.lancamentos, p.de, p.ate));
        const rB = receitas(inRange(db.lancamentos, p.antDe, p.antAte));
        const total = sum(rA.map((x) => x.valor));
        const by = (xs: typeof rA, id: string) => sum(xs.filter((x) => x.clienteId === id).map((x) => x.valor));
        let acc = 0;
        const lista = db.clientes.map((c) => ({ c, a: by(rA, c.id), b: by(rB, c.id), n: rA.filter((x) => x.clienteId === c.id).length }))
          .filter((x) => x.a > 0 || x.b > 0).sort((x, y) => y.a - x.a);
        const rows = lista.map((x) => {
          acc += x.a;
          const cum = total ? acc / total : 0;
          return [x.c.nome, x.n, money(x.a), pct(total ? x.a / total : 0, 1), pct(cum, 1), x.a === 0 ? '—' : cum <= 0.8 ? 'A' : cum <= 0.95 ? 'B' : 'C', v(x.a, x.b)];
        });
        const classeA = rows.filter((r) => r[5] === 'A').length;
        const perdidos = lista.filter((x) => x.a === 0 && x.b > 0);
        return {
          columns: ['Cliente', 'Vendas', 'Faturamento', 'Part.', 'Acumulado', 'Classe', 'Var. vs anterior'], rows,
          footer: ['TOTAL', rA.length, money(total), '100%', '', '', v(total, sum(rB.map((x) => x.valor)))],
          notes: [
            `${classeA} cliente(s) respondem por ~80% do faturamento (classe A).`,
            perdidos.length ? `${perdidos.length} cliente(s) compraram no período anterior e não compraram neste: ${perdidos.map((x) => x.c.nome).join(', ')} (${money(sum(perdidos.map((x) => x.b)))}).` : 'Nenhum cliente do período anterior deixou de comprar.',
          ],
        };
      },
    },
    {
      id: 'recencia', title: 'Clientes em Risco (Recência)', desc: 'Dias desde a última compra, frequência e valor — prioriza ações de reativação.', icon: <UserX size={20} />,
      build: (db) => {
        const hoje = today();
        const rows = db.clientes.map((c) => {
          const r = receitas(db.lancamentos).filter((l) => l.clienteId === c.id);
          const ult = r.reduce((m, l) => (l.data > m ? l.data : m), '');
          const dias = ult ? diffDays(hoje, ult) : Infinity;
          const val = sum(r.filter((l) => l.data >= addDays(hoje, -365)).map((l) => l.valor));
          const status = !ult ? 'Sem compras' : dias > 180 ? 'Perdido' : dias > 90 ? 'Em risco' : dias > 45 ? 'Atenção' : 'Ativo';
          return { c, ult, dias, val, n: r.length, status };
        }).sort((a, b) => (b.dias === Infinity ? 1e9 : b.dias) - (a.dias === Infinity ? 1e9 : a.dias));
        const risco = rows.filter((r) => r.status === 'Em risco' || r.status === 'Perdido');
        return {
          columns: ['Cliente', 'Última compra', 'Dias', 'Compras (total)', 'Receita 12m', 'Situação'],
          rows: rows.map((r) => [r.c.nome, date(r.ult), r.dias === Infinity ? '—' : r.dias, r.n, money(r.val), r.status]),
          notes: [`${risco.length} cliente(s) em risco ou perdidos, que somaram ${money(sum(risco.map((r) => r.val)))} em 12 meses. Sugestão: contato ativo com oferta de revisão/manutenção preventiva.`],
        };
      },
    },
  ],
  Serviços: [
    {
      id: 'servicos', title: 'Vendas por Serviço', desc: 'Quantidade, faturamento, ticket médio e variação por categoria de serviço.', icon: <BarChart3 size={20} />,
      build: (db, p) => {
        const rA = receitas(inRange(db.lancamentos, p.de, p.ate));
        const rB = receitas(inRange(db.lancamentos, p.antDe, p.antAte));
        const total = sum(rA.map((x) => x.valor));
        const cats = [...new Set([...rA, ...rB].map((x) => x.categoria))];
        const lista = cats.map((c) => {
          const a = rA.filter((x) => x.categoria === c), b = rB.filter((x) => x.categoria === c);
          const va = sum(a.map((x) => x.valor)), vb = sum(b.map((x) => x.valor));
          return { c, qa: a.length, qb: b.length, va, vb, ta: a.length ? va / a.length : 0, tb: b.length ? vb / b.length : 0 };
        }).sort((x, y) => y.va - x.va);
        const notes = lista.filter((x) => x.vb > 0 && Math.abs(x.va - x.vb) / x.vb > 0.15).map((x) => {
          const dv = (x.qa - x.qb) * x.tb, dt = (x.ta - x.tb) * x.qa;
          return `${x.c}: ${x.va > x.vb ? 'alta' : 'queda'} de ${money(Math.abs(x.va - x.vb))}, explicada principalmente por ${Math.abs(dv) >= Math.abs(dt) ? `volume (${x.qa} vs ${x.qb} vendas)` : `ticket (${money(x.ta)} vs ${money(x.tb)})`}.`;
        });
        return {
          columns: ['Serviço', 'Qtd.', 'Faturamento', 'Part.', 'Ticket médio', 'Var. faturamento', 'Var. qtd.'],
          rows: lista.map((x) => [x.c, x.qa, money(x.va), pct(total ? x.va / total : 0, 1), money(x.ta), v(x.va, x.vb), v(x.qa, x.qb)]),
          footer: ['TOTAL', rA.length, money(total), '100%', money(rA.length ? total / rA.length : 0), v(total, sum(rB.map((x) => x.valor))), v(rA.length, rB.length)],
          notes: notes.length ? notes : ['Nenhuma categoria variou mais de 15% em relação ao período anterior.'],
        };
      },
    },
    {
      id: 'os', title: 'Desempenho Operacional (OS)', desc: 'Volume, prazo cumprido e tempo médio de execução por tipo de serviço.', icon: <Wrench size={20} />,
      build: (db, p) => {
        const hoje = today();
        const os = db.ordens.filter((o) => o.abertura >= p.de && o.abertura <= p.ate);
        const cats = [...new Set(os.map((o) => o.categoria))];
        const rows = cats.map((c) => {
          const xs = os.filter((o) => o.categoria === c);
          const fin = xs.filter((o) => o.status === 'Finalizada' && o.conclusao);
          const noPrazo = fin.filter((o) => o.conclusao! <= o.prazo).length;
          const atras = xs.filter((o) => ['Aberta', 'Em andamento', 'Aguardando peças'].includes(o.status) && o.prazo < hoje).length;
          const tm = fin.length ? sum(fin.map((o) => diffDays(o.conclusao!, o.abertura))) / fin.length : 0;
          return [c, xs.length, fin.length, fin.length ? pct(noPrazo / fin.length) : '—', fin.length ? `${tm.toFixed(1).replace('.', ',')} d` : '—', atras, money(sum(xs.map((o) => o.valor)))];
        });
        const aguard = db.ordens.filter((o) => o.status === 'Aguardando peças');
        return {
          columns: ['Serviço', 'Abertas no período', 'Finalizadas', 'No prazo', 'Tempo médio', 'Atrasadas', 'Valor'], rows,
          notes: [
            aguard.length ? `${aguard.length} OS paradas aguardando peças (${money(sum(aguard.map((o) => o.valor)))}). Manter estoque mínimo dos itens mais usados reduz o ciclo.` : 'Nenhuma OS aguardando peças.',
          ],
        };
      },
    },
  ],
  Comercial: [
    {
      id: 'funil', title: 'Conversão do Funil', desc: 'Oportunidades, valor e taxa de avanço em cada etapa do funil.', icon: <Filter size={20} />,
      build: (db) => {
        const etapas = ['Leads', 'Em contato', 'Proposta', 'Negociação', 'Fechados'];
        const ops = db.oportunidades;
        const rows = etapas.map((e, i) => {
          const naEtapa = ops.filter((o) => o.etapa === e);
          const chegaram = ops.filter((o) => etapas.indexOf(o.etapa) >= i).length;
          const avancaram = ops.filter((o) => etapas.indexOf(o.etapa) > i).length;
          return [e, naEtapa.length, money(sum(naEtapa.map((o) => o.valor))), chegaram, i < 4 ? pct(chegaram ? avancaram / chegaram : 0) : '—'];
        });
        const piores = rows.slice(0, 4).map((r, i) => [etapas[i], Number(String(r[4]).replace('%', ''))] as const).sort((a, b) => a[1] - b[1])[0];
        return {
          columns: ['Etapa', 'Oportunidades', 'Valor', 'Chegaram à etapa', 'Avanço p/ próxima'], rows,
          notes: [`Maior gargalo: saída de "${piores[0]}" (${piores[1]}% avançam). Concentre follow-up nesta etapa.`],
        };
      },
    },
    {
      id: 'orc', title: 'Orçamentos por Status', desc: 'Quantidade, valor e taxa de conversão dos orçamentos por categoria.', icon: <PieChart size={20} />,
      build: (db) => {
        const cats = [...new Set(db.orcamentos.map((o) => o.categoria))];
        const rows = cats.map((c) => {
          const xs = db.orcamentos.filter((o) => o.categoria === c);
          const conv = xs.filter((o) => o.status === 'Convertido'), rec = xs.filter((o) => o.status === 'Recusado');
          const dec = conv.length + rec.length;
          return [c, xs.length, money(sum(xs.map((o) => o.valor))), conv.length, rec.length, dec ? pct(conv.length / dec) : '—'];
        });
        return { columns: ['Categoria', 'Orçamentos', 'Valor total', 'Convertidos', 'Recusados', 'Conversão'], rows, notes: ['Conversão = convertidos ÷ (convertidos + recusados); orçamentos em aberto não entram na taxa.'] };
      },
    },
  ],
};

export default function Relatorios() {
  const { db } = useStore();
  const [tab, setTab] = useState('Financeiro');
  const [periodo, setPeriodo] = useState('mes');
  const [open, setOpen] = useState<Report | null>(null);
  const p = calcPeriodo(periodo);

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Visualize o desempenho do seu negócio. Cada relatório traz comparação com o período anterior e pontos de atenção.">
        <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 220 }}>
          <option value="mes">Mês atual (até hoje)</option>
          <option value="ant">Mês anterior</option>
          <option value="3m">Últimos 3 meses</option>
          <option value="12m">Últimos 12 meses</option>
        </select>
      </PageHeader>
      <div className="card">
        <div className="tabs">
          {Object.keys(REPORTS).map((t) => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        {REPORTS[tab].map((r) => (
          <div key={r.id} className="report-row">
            <div className="ico">{r.icon}</div>
            <div style={{ flex: 1 }}>
              <div className="t">{r.title}</div>
              <div className="d">{r.desc} · Período: {p.label}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(r)}><TrendingUp size={14} /> Gerar</button>
          </div>
        ))}
      </div>
      {open && <ReportModal r={open} built={open.build(db, p)} p={p} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReportModal({ r, built, p, onClose }: { r: Report; built: Built; p: Periodo; onClose: () => void }) {
  const { db } = useStore();
  return (
    <Modal wide title={r.title} onClose={onClose} footer={<>
      <button className="btn" onClick={() => window.print()}><Printer size={15} /> Imprimir / PDF</button>
      <button className="btn btn-primary" onClick={() => downloadCSV(`${r.id}_${p.de}_${p.ate}.csv`, [built.columns, ...built.rows, ...(built.footer ? [built.footer] : [])])}><Download size={15} /> Exportar CSV</button>
    </>}>
      <div className="small muted" style={{ marginBottom: 12 }}>
        {db.empresa.nome} · Período: {date(p.de)} a {date(p.ate)} · Comparação: {date(p.antDe)} a {date(p.antAte)} · Gerado em {date(today())}
      </div>
      {built.notes.length > 0 && (
        <div className="insight opp" style={{ marginBottom: 14 }}>
          <div className="ico tone-blue"><Lightbulb size={16} /></div>
          <div>{built.notes.map((n) => <div key={n} className="d">• {n}</div>)}</div>
        </div>
      )}
      <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
        <table className="table table-compact">
          <thead><tr>{built.columns.map((c, i) => <th key={c} className={i ? 'num' : ''}>{c}</th>)}</tr></thead>
          <tbody>
            {built.rows.map((row, i) => (
              <tr key={i}>{row.map((c, j) => (
                <td key={j} className={`${j ? 'num' : ''} ${String(row[0]).startsWith('   ') ? '' : j === 0 && String(row[0]) === String(row[0]).toUpperCase() ? 'strong' : ''} ${typeof c === 'string' && /^[+−]/.test(c) ? (c.startsWith('+') ? 'text-success' : 'text-danger') : ''}`}
                  style={j === 0 ? { whiteSpace: 'pre' } : undefined}>{c}</td>
              ))}</tr>
            ))}
            {built.rows.length === 0 && <tr><td colSpan={built.columns.length} className="empty">Sem dados no período.</td></tr>}
          </tbody>
          {built.footer && (
            <tfoot><tr style={{ background: 'var(--primary-50)' }}>{built.footer.map((c, j) => <td key={j} className={`strong ${j ? 'num' : ''}`}>{c}</td>)}</tr></tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}

function calcPeriodo(k: string): Periodo {
  const hoje = today();
  const d = parseDate(hoje);
  let de: string, ate: string, antDe: string, antAte: string, label: string;
  if (k === 'ant') {
    de = toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)); ate = toISODate(new Date(d.getFullYear(), d.getMonth(), 0));
    antDe = toISODate(new Date(d.getFullYear(), d.getMonth() - 2, 1)); antAte = toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 0));
    label = monthLabel(de.slice(0, 7));
  } else if (k === '3m' || k === '12m') {
    const n = k === '3m' ? 3 : 12;
    de = toISODate(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1)); ate = hoje;
    antAte = addDays(de, -1); antDe = toISODate(new Date(d.getFullYear(), d.getMonth() - (2 * n - 1), 1));
    // mesmo nº de dias no período anterior para comparação justa
    antDe = addDays(antAte, -diffDays(ate, de));
    label = `últimos ${n} meses`;
  } else {
    de = `${hoje.slice(0, 7)}-01`; ate = hoje;
    const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const ult = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    antDe = toISODate(pm); antAte = toISODate(new Date(pm.getFullYear(), pm.getMonth(), Math.min(d.getDate(), ult)));
    label = `${monthLabel(hoje.slice(0, 7))} (dias 1–${d.getDate()})`;
  }
  return { de, ate, antDe, antAte, label };
}
