import { useMemo, useState } from 'react';
import { Calculator, Lightbulb, RotateCcw, Scale, Target } from 'lucide-react';
import { useStore } from '../store/Store';
import { PageHeader } from '../components/ui';
import { Field, toNumber } from '../components/fields';
import { addDays, lastMonths, money, monthKey, monthLabel, pct, today } from '../utils/format';
import { periodos } from '../utils/metrics';

const VARIAVEIS = ['Peças e acessórios'];

export default function Planejamento() {
  const { db } = useStore();
  const hoje = today();
  const p = periodos(hoje);

  /* ---------- Base histórica: últimos 3 meses fechados ---------- */
  const base = useMemo(() => {
    const meses = lastMonths(4).slice(0, 3);
    const doPeriodo = db.lancamentos.filter((l) => meses.includes(monthKey(l.data)));
    const receita = doPeriodo.filter((l) => l.tipo === 'Receita').reduce((a, l) => a + l.valor, 0) / 3;
    const variaveis = doPeriodo.filter((l) => l.tipo === 'Despesa' && VARIAVEIS.includes(l.categoria)).reduce((a, l) => a + l.valor, 0) / 3;
    const fixos = doPeriodo.filter((l) => l.tipo === 'Despesa' && !VARIAVEIS.includes(l.categoria)).reduce((a, l) => a + l.valor, 0) / 3;
    const avulsas = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.categoria !== 'Recorrência' && l.data >= addDays(hoje, -90));
    const ticket = avulsas.length ? avulsas.reduce((a, l) => a + l.valor, 0) / avulsas.length : 0;
    const decididos = db.orcamentos.filter((o) => o.status === 'Convertido' || o.status === 'Recusado');
    const conversao = decididos.length ? decididos.filter((o) => o.status === 'Convertido').length / decididos.length : 0.3;
    const leads = Math.max(1, db.oportunidades.filter((o) => o.criadoEm >= addDays(hoje, -30)).length);
    const contratosAtivos = db.contratos.filter((c) => c.status === 'Ativo');
    const mrr = contratosAtivos.reduce((a, c) => a + c.valorMensal, 0);
    const ticketContrato = contratosAtivos.length ? mrr / contratosAtivos.length : 300;
    // vendas avulsas por mês que não passam pelo funil (clientes recorrentes que compram direto)
    const vendasMes = avulsas.length / 3;
    const vendasDiretas = Math.max(0, Math.round(vendasMes - leads * conversao));
    return { meses, receita, variaveis, fixos, ticket, conversao, leads, mrr, ticketContrato, vendasDiretas };
  }, [db, hoje]);

  /* ---------- Ponto de equilíbrio ---------- */
  const [proLabore, setProLabore] = useState(3000);
  const mc = base.receita ? (base.receita - base.variaveis) / base.receita : 0;
  const pe = mc > 0 ? base.fixos / mc : 0;
  const peComPL = mc > 0 ? (base.fixos + proLabore) / mc : 0;
  const seguranca = base.receita ? (base.receita - peComPL) / base.receita : 0;
  const maxBar = Math.max(base.receita, peComPL, 1) * 1.1;

  /* ---------- Simulador ---------- */
  const inicial = { leads: base.leads, conversao: Math.round(base.conversao * 100), ticket: Math.round(base.ticket), diretas: base.vendasDiretas, novosContratos: 0 };
  const [sim, setSim] = useState(inicial);
  const calc = (x: typeof sim) =>
    (x.leads * (x.conversao / 100) + x.diretas) * x.ticket + base.mrr + x.novosContratos * base.ticketContrato;
  const projetado = calc(sim);
  const lucroProj = projetado * mc - base.fixos;
  const alavancas = [
    { nome: '+10% de leads', delta: calc({ ...sim, leads: sim.leads * 1.1 }) - projetado, area: 'Marketing' },
    { nome: '+5 p.p. de conversão', delta: calc({ ...sim, conversao: sim.conversao + 5 }) - projetado, area: 'Comercial (follow-up)' },
    { nome: '+10% no ticket médio', delta: calc({ ...sim, ticket: sim.ticket * 1.1 }) - projetado, area: 'Preço e pacotes' },
    { nome: '+2 contratos mensais', delta: calc({ ...sim, novosContratos: sim.novosContratos + 2 }) - projetado, area: 'Recorrência' },
  ].sort((a, b) => b.delta - a.delta);
  const meta = db.empresa.metaMensal;

  /* ---------- Meta por categoria ---------- */
  const metaCat = useMemo(() => {
    const hist = db.lancamentos.filter((l) => l.tipo === 'Receita' && base.meses.includes(monthKey(l.data)));
    const total = hist.reduce((a, l) => a + l.valor, 0);
    const cats = [...new Set(hist.map((l) => l.categoria))];
    const mtd = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.data >= p.atual[0] && l.data <= p.atual[1]);
    return cats.map((c) => {
      const share = total ? hist.filter((l) => l.categoria === c).reduce((a, l) => a + l.valor, 0) / total : 0;
      const alvo = meta * share;
      const real = mtd.filter((l) => l.categoria === c).reduce((a, l) => a + l.valor, 0);
      const proj = p.dia ? (real / p.dia) * p.diasMes : 0;
      return { c, share, alvo, real, proj, ating: alvo ? proj / alvo : 0 };
    }).sort((a, b) => b.alvo - a.alvo);
  }, [db.lancamentos, base.meses, meta, p]);

  const num = (k: keyof typeof sim, label: string, hint: string, step = 1, suffix = '') => (
    <Field label={label} hint={hint}>
      <div className="row">
        <input className="input" type="number" step={step} min={0} value={sim[k]} onChange={(e) => setSim({ ...sim, [k]: toNumber(e.target.value) })} />
        {suffix && <span className="small muted">{suffix}</span>}
      </div>
    </Field>
  );

  return (
    <>
      <PageHeader title="Planejamento" subtitle={`Ponto de equilíbrio, simulação de cenários e metas. Base: média de ${base.meses.map(monthLabel).join(', ')}.`} />

      <div className="grid g-2">
        {/* Ponto de equilíbrio */}
        <div className="card">
          <div className="card-head"><h3 className="row"><Scale size={16} color="var(--primary)" /> Ponto de equilíbrio mensal</h3></div>
          <div style={{ padding: '14px 20px 20px' }}>
            <div className="grid g-2" style={{ gap: 10 }}>
              <Mini l="Receita média" v={money(base.receita)} />
              <Mini l="Custos fixos" v={money(base.fixos)} s="software, marketing, transporte, impostos" />
              <Mini l="Custos variáveis" v={money(base.variaveis)} s="peças e acessórios" />
              <Mini l="Margem de contribuição" v={pct(mc, 1)} s="sobra de cada R$ 1 vendido" />
            </div>
            <div className="divider" />
            <Field label="Pró-labore desejado (R$/mês)" hint="Sua retirada como dono. Sem ela, o equilíbrio esconde quanto o negócio realmente precisa faturar.">
              <input className="input" inputMode="decimal" defaultValue={String(proLabore)} onChange={(e) => setProLabore(toNumber(e.target.value))} />
            </Field>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <Barra l="Receita média" v={base.receita} max={maxBar} cor="var(--primary)" />
              <Barra l="Equilíbrio (só custos)" v={pe} max={maxBar} cor="#9cc2f7" />
              <Barra l="Equilíbrio + pró-labore" v={peComPL} max={maxBar} cor="var(--navy-700)" />
            </div>
            <div className={`insight ${seguranca >= 0.15 ? 'good' : seguranca >= 0 ? 'warn' : 'risk'}`} style={{ marginTop: 14 }}>
              <div className="d">
                {seguranca >= 0
                  ? <>Margem de segurança de <strong>{pct(seguranca)}</strong>: a receita pode cair até {money(base.receita - peComPL)} por mês antes de não cobrir custos e pró-labore.</>
                  : <>A receita média está <strong>{money(peComPL - base.receita)}</strong> abaixo do necessário para pagar custos e pró-labore.</>}
              </div>
            </div>
          </div>
        </div>

        {/* Simulador */}
        <div className="card">
          <div className="card-head">
            <h3 className="row"><Calculator size={16} color="var(--primary)" /> Simulador de cenários (mês)</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => setSim(inicial)}><RotateCcw size={14} /> Valores reais</button>
          </div>
          <div className="form-grid" style={{ padding: '14px 20px 0' }}>
            {num('leads', 'Leads por mês', `Real (30 dias): ${base.leads}`)}
            {num('conversao', 'Conversão de orçamentos', `Real: ${pct(base.conversao)}`, 1, '%')}
            {num('ticket', 'Ticket médio avulso (R$)', `Real (90 dias): ${money(base.ticket)}`, 10)}
            {num('diretas', 'Vendas diretas (sem funil)', 'Recompras de clientes da base')}
            {num('novosContratos', 'Novos contratos no mês', `Ticket médio de contrato: ${money(base.ticketContrato)}`)}
            <div className="field"><label>Receita recorrente atual</label><div className="strong" style={{ paddingTop: 8 }}>{money(base.mrr)}</div></div>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <div className="grid g-2" style={{ gap: 10 }}>
              <Mini l="Faturamento projetado" v={money(projetado)} s={`${pct(meta ? projetado / meta : 0)} da meta de ${money(meta)}`} destaque={projetado >= meta ? 'text-success' : 'text-warning'} />
              <Mini l="Resultado projetado" v={money(lucroProj)} s="margem de contribuição − custos fixos" destaque={lucroProj >= proLabore ? 'text-success' : 'text-danger'} />
            </div>
            <div className="strong small" style={{ margin: '16px 0 6px' }}>Qual alavanca rende mais a partir deste cenário?</div>
            <table className="table table-compact">
              <tbody>
                {alavancas.map((a, i) => (
                  <tr key={a.nome}>
                    <td>{i === 0 && <Lightbulb size={13} color="var(--primary)" />} {a.nome}<div className="sub">{a.area}</div></td>
                    <td className="num strong text-success">+{money(a.delta)}/mês</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Meta por categoria */}
      <div className="card mt">
        <div className="card-head">
          <div>
            <h3 className="row"><Target size={16} color="var(--primary)" /> Meta do mês por categoria</h3>
            <div className="card-sub">A meta de {money(meta)} é dividida pela participação histórica de cada categoria. Projeção = ritmo dos dias 1–{p.dia} estendido ao mês.{p.dia < 7 && <strong className="text-warning"> Início do mês: projeção ainda pouco confiável.</strong>}</div>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead><tr><th>Categoria</th><th className="num">Participação</th><th className="num">Meta</th><th className="num">Realizado</th><th className="num">Projeção</th><th style={{ width: '28%' }}>Atingimento projetado</th></tr></thead>
            <tbody>
              {metaCat.map((r) => (
                <tr key={r.c}>
                  <td className="strong">{r.c}</td>
                  <td className="num">{pct(r.share, 1)}</td>
                  <td className="num">{money(r.alvo)}</td>
                  <td className="num">{money(r.real)}</td>
                  <td className="num strong">{money(r.proj)}</td>
                  <td>
                    <div className="row">
                      <div className="meter" style={{ flex: 1, marginTop: 0 }}><span style={{ width: `${Math.min(100, r.ating * 100)}%`, background: r.ating >= 1 ? 'var(--success)' : r.ating >= 0.8 ? 'var(--warning)' : 'var(--danger)' }} /></div>
                      <span className={`small strong ${r.ating >= 1 ? 'text-success' : r.ating >= 0.8 ? 'text-warning' : 'text-danger'}`}>{pct(r.ating)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Mini({ l, v, s, destaque }: { l: string; v: string; s?: string; destaque?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div className="small muted">{l}</div>
      <div className={`strong ${destaque ?? ''}`} style={{ fontSize: 17 }}>{v}</div>
      {s && <div className="small muted">{s}</div>}
    </div>
  );
}

function Barra({ l, v, max, cor }: { l: string; v: number; max: number; cor: string }) {
  return (
    <div>
      <div className="row between small"><span>{l}</span><strong>{money(v)}</strong></div>
      <div className="meter" style={{ height: 10, marginTop: 4 }}><span style={{ width: `${(v / max) * 100}%`, background: cor }} /></div>
    </div>
  );
}
