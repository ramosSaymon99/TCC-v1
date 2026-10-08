import { useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';
import { CHANNELS, brl, channelById, daysBetween, fmtX, fromISO, num, pct, simulate } from '../model';
import { phaseWindows } from '../calendar';
import { AppState } from '../state';
import { Dot, copyText } from '../ui';

const longDate = (iso: string) => fromISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export default function Plano({ state }: { state: AppState }) {
  const c = state.campaign;
  const { rows, totals } = simulate(c);
  const days = Math.max(daysBetween(c.start, c.end), 1);
  const active = rows.filter((r) => r.spend > 0);
  const windows = phaseWindows(c);
  const [copied, setCopied] = useState(false);

  // Regras de decisão a partir das metas: transformam o plano em gatilhos de ação durante a campanha
  const rules = [
    `Após 3 dias, canal com CPL acima de ${brl(totals.cpl * 1.3, 2)} (30% acima da meta) troca criativos; se persistir por mais 3 dias, a verba vai para o canal de menor CAC.`,
    `Canal com CAC abaixo de ${brl(totals.cac * 0.8)} por 5 dias seguidos recebe +20% de verba, testando a saturação.`,
    `Nenhum canal pode passar de ${brl(totals.maxCac)} de CAC acumulado (o CAC máximo): acima disso, cada venda dá prejuízo.`,
    `Se o ROAS total estiver abaixo de ${fmtX(totals.breakEvenRoas)} na metade da campanha, revisar oferta e página antes de investir o restante.`,
  ];

  const summary = [
    `*${c.name}*`,
    `${longDate(c.start)} a ${longDate(c.end)} (${days} dias)`,
    `Investimento: ${brl(totals.spend)} (${brl(totals.spend / days)}/dia)`,
    `Metas: ${num(totals.leads)} leads (CPL ${brl(totals.cpl, 2)}), ${num(totals.sales)} vendas (CAC ${brl(totals.cac)}), ${brl(totals.revenue)} em receita, ROAS ${fmtX(totals.roas)}`,
    `Canais: ${active.map((r) => `${channelById(r.id).short} ${pct(r.spend / totals.spend)}`).join(', ')}`,
  ].join('\n');

  return (
    <div className="plan">
      <div className="plan-actions no-print">
        <button className="btn btn-ghost" onClick={() => copyText(summary).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}>
          {copied ? <Check size={16} /> : <Copy size={16} />} Copiar resumo
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / salvar PDF
        </button>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <span className="eyebrow">Plano de campanha</span>
          <h1>{c.name}</h1>
          <p className="muted">
            {longDate(c.start)} a {longDate(c.end)} · {days} dias · objetivo: {c.goal === 'leads' ? 'gerar leads' : 'maximizar resultado'}
          </p>
        </header>

        <section>
          <h2>Metas</h2>
          <div className="sheet-kpis">
            <div>
              <span>Investimento</span>
              <strong>{brl(totals.spend)}</strong>
              <small>{brl(totals.spend / days)} por dia</small>
            </div>
            <div>
              <span>Leads</span>
              <strong>{num(totals.leads)}</strong>
              <small>CPL {brl(totals.cpl, 2)}</small>
            </div>
            <div>
              <span>Vendas</span>
              <strong>{num(totals.sales, totals.sales < 10 ? 1 : 0)}</strong>
              <small>CAC {brl(totals.cac)} (máx. {brl(totals.maxCac)})</small>
            </div>
            <div>
              <span>Receita</span>
              <strong>{brl(totals.revenue)}</strong>
              <small>
                ROAS {fmtX(totals.roas)} (equilíbrio {fmtX(totals.breakEvenRoas)})
              </small>
            </div>
          </div>
        </section>

        <section>
          <h2>Canais e verba</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Verba</th>
                <th>Fatia</th>
                <th>Leads</th>
                <th>Vendas</th>
                <th>CAC</th>
                <th>UTM</th>
              </tr>
            </thead>
            <tbody>
              {active.map((r) => {
                const ch = channelById(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <Dot color={ch.color} /> {ch.short}
                    </td>
                    <td>{brl(r.spend)}</td>
                    <td>{pct(r.spend / totals.spend)}</td>
                    <td>{num(r.leads)}</td>
                    <td>{num(r.sales, 1)}</td>
                    <td className={r.cac > totals.maxCac ? 'neg' : ''}>{brl(r.cac)}</td>
                    <td className="mono small">
                      {ch.utmSource}/{ch.utmMedium}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {CHANNELS.length > active.length && (
            <p className="muted small">Sem verba: {CHANNELS.filter((ch) => !active.some((r) => r.id === ch.id)).map((ch) => ch.short).join(', ')}.</p>
          )}
        </section>

        <section>
          <h2>Cronograma</h2>
          <ol className="sheet-phases">
            {windows.map((w) => {
              const n = state.calendar.filter((i) => i.phase === w.phase).length;
              return (
                <li key={w.phase}>
                  <strong>{w.phase}</strong>
                  <span>
                    {fromISO(w.start).toLocaleDateString('pt-BR')} a {fromISO(w.end).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="muted">
                    {n} {n === 1 ? 'ação' : 'ações'}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section>
          <h2>Regras de decisão</h2>
          <ul className="rules">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Acompanhamento</h2>
          <table className="table compact">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Meta</th>
                <th>Frequência</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CPL por canal</td>
                <td>{brl(totals.cpl, 2)}</td>
                <td>Diária</td>
              </tr>
              <tr>
                <td>Taxa lead → venda</td>
                <td>{pct(totals.leads ? totals.sales / totals.leads : 0, 1)}</td>
                <td>A cada 3 dias</td>
              </tr>
              <tr>
                <td>CAC por canal</td>
                <td>até {brl(totals.maxCac)}</td>
                <td>Semanal</td>
              </tr>
              <tr>
                <td>ROAS acumulado</td>
                <td>{fmtX(totals.roas)}</td>
                <td>Semanal</td>
              </tr>
              <tr>
                <td>Ritmo de investimento</td>
                <td>{brl(totals.spend / days)}/dia</td>
                <td>Diária</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="sheet-foot muted small">
          Estimativas a partir das premissas de custo e conversão de cada canal. Atualize-as com os dados reais após a primeira semana.
        </footer>
      </article>
    </div>
  );
}
