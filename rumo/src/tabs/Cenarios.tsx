import { useMemo, useState } from 'react';
import { GitCompare, Save, Trash2, Upload } from 'lucide-react';
import { CHANNELS, Campaign, brl, fmtX, monteCarlo, num, pct, simulate } from '../model';
import { AppState, Scenario } from '../state';
import type { Update } from '../App';
import { Card } from '../ui';

interface Props {
  state: AppState;
  update: Update;
}

export function saveScenario(update: Update, name: string) {
  update((s) => ({
    ...s,
    scenarios: [
      ...s.scenarios,
      { id: `s${Date.now().toString(36)}`, name: name.trim() || `Cenário ${s.scenarios.length + 1}`, savedAt: new Date().toISOString(), campaign: structuredClone(s.campaign) },
    ].slice(-6),
  }));
}

interface Row {
  label: string;
  get: (m: Metrics) => number;
  fmt: (v: number) => string;
  better: 'high' | 'low';
}

interface Metrics {
  budget: number;
  leads: number;
  sales: number;
  cpl: number;
  cac: number;
  roas: number;
  profit: number;
  p10: number;
  loss: number;
}

function metrics(c: Campaign): Metrics {
  const t = simulate(c).totals;
  const r = monteCarlo({ ...c, goal: 'lucro' }, c.alloc, 1000);
  return { budget: t.spend, leads: t.leads, sales: t.sales, cpl: t.cpl, cac: t.cac, roas: t.roas, profit: t.profit, p10: r.p10, loss: r.lossProb };
}

const ROWS: Row[] = [
  { label: 'Investimento', get: (m) => m.budget, fmt: (v) => brl(v), better: 'low' },
  { label: 'Leads', get: (m) => m.leads, fmt: (v) => num(v), better: 'high' },
  { label: 'Vendas', get: (m) => m.sales, fmt: (v) => num(v, 1), better: 'high' },
  { label: 'CPL', get: (m) => m.cpl, fmt: (v) => brl(v, 2), better: 'low' },
  { label: 'CAC', get: (m) => m.cac, fmt: (v) => brl(v), better: 'low' },
  { label: 'ROAS', get: (m) => m.roas, fmt: (v) => fmtX(v), better: 'high' },
  { label: 'Resultado previsto', get: (m) => m.profit, fmt: (v) => brl(v), better: 'high' },
  { label: 'Resultado pessimista (P10)', get: (m) => m.p10, fmt: (v) => brl(v), better: 'high' },
  { label: 'Chance de prejuízo', get: (m) => m.loss, fmt: (v) => pct(v), better: 'low' },
];

export default function Cenarios({ state, update }: Props) {
  const [name, setName] = useState('');
  const columns = useMemo(
    () => [
      { id: 'atual', name: 'Plano atual', campaign: state.campaign, current: true },
      ...state.scenarios.map((s: Scenario) => ({ id: s.id, name: s.name, campaign: s.campaign, current: false })),
    ],
    [state.campaign, state.scenarios],
  );
  const data = useMemo(() => columns.map((col) => metrics(col.campaign)), [columns]);

  return (
    <div className="scen">
      <Card title="Salvar o plano atual">
        <div className="scen-save">
          <label className="field grow">
            <span className="field-label">Nome do cenário</span>
            <input
              value={name}
              placeholder="ex.: Conservador, Agressivo em Meta, Orçamento ótimo"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveScenario(update, name);
                  setName('');
                }
              }}
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={() => {
              saveScenario(update, name);
              setName('');
            }}
          >
            <Save size={16} /> Salvar cenário
          </button>
        </div>
        <p className="muted small">Guarde até 6 versões (orçamento, distribuição e premissas) e compare risco e retorno lado a lado. Atalho: Ctrl+K → Salvar cenário.</p>
      </Card>

      {state.scenarios.length === 0 ? (
        <div className="empty-panel">
          <GitCompare size={28} />
          <p>
            Nenhum cenário salvo ainda. Salve o plano atual, mude orçamento ou distribuição no Simulador e salve de novo para comparar.
          </p>
        </div>
      ) : (
        <Card title="Comparação" className="table-card">
          <div className="table-scroll">
            <table className="table scen-table">
              <thead>
                <tr>
                  <th />
                  {columns.map((col) => (
                    <th key={col.id} className={col.current ? 'cur' : ''}>
                      <span className="scen-name">{col.name}</span>
                      {!col.current && (
                        <span className="scen-actions">
                          <button
                            className="icon-btn ghost"
                            aria-label={`Usar ${col.name} como plano atual`}
                            title="Usar como plano atual"
                            onClick={() => update((s) => ({ ...s, campaign: structuredClone(col.campaign) }))}
                          >
                            <Upload size={14} />
                          </button>
                          <button
                            className="icon-btn ghost"
                            aria-label={`Excluir ${col.name}`}
                            title="Excluir"
                            onClick={() => update((s) => ({ ...s, scenarios: s.scenarios.filter((x) => x.id !== col.id) }))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Distribuição</td>
                  {columns.map((col) => (
                    <td key={col.id}>
                      <div className="mix" role="img" aria-label={CHANNELS.map((ch) => `${ch.short} ${pct(col.campaign.alloc[ch.id])}`).join(', ')}>
                        {CHANNELS.filter((ch) => col.campaign.alloc[ch.id] > 0.005).map((ch) => (
                          <span key={ch.id} style={{ flexGrow: col.campaign.alloc[ch.id], background: ch.color }} title={`${ch.short} ${pct(col.campaign.alloc[ch.id])}`} />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
                {ROWS.map((row) => {
                  const vals = data.map(row.get);
                  const best = row.better === 'high' ? Math.max(...vals) : Math.min(...vals);
                  const differs = vals.some((v) => Math.abs(v - vals[0]) > 1e-6);
                  return (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      {vals.map((v, i) => (
                        <td key={columns[i].id} className={differs && v === best ? 'best' : ''}>
                          {row.fmt(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">Em destaque, o melhor valor de cada linha. O risco considera o resultado financeiro em todos os cenários.</p>
        </Card>
      )}
    </div>
  );
}
