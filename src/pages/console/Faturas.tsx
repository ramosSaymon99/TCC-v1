import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckCircle2, Download, FileText, Gavel, Receipt, Wallet } from 'lucide-react';
import { usePlataforma } from '../../store/PlataformaStore';
import { useStore } from '../../store/Store';
import type { Assinante, Fatura } from '../../types';
import { Badge, Confirm, Empty, Kpi, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../../components/ui';
import { date, diffDays, downloadCSV, lastMonths, MESES_LONGOS, money, monthLabel, normalize, pad, pct, today } from '../../utils/format';
import { cfgDe, mrrDe, PAGANTE, planoDe, vencida } from '../../store/plataforma';

type Row = Fatura & { empresa: string; plano: string; situacao: string; atraso: number };

export default function ConsoleFaturas() {
  const { dados, salvar, excluir } = usePlataforma();
  const { toast } = useStore();
  const [params] = useSearchParams();
  const hoje = today();
  const mesAtual = hoje.slice(0, 7);
  const [q, setQ] = useState('');
  const [situacao, setSituacao] = useState(params.get('filtro') === 'vencidas' ? 'Vencida' : '');
  const [comp, setComp] = useState('');
  const [gerar, setGerar] = useState(false);
  const [regua, setRegua] = useState(false);
  const [excluindo, setExcluindo] = useState<Row | null>(null);
  const cfg = cfgDe(dados);
  const nomeDe = useMemo(() => new Map(dados.assinantes.map((a) => [a.id, a])), [dados.assinantes]);

  const rows: Row[] = useMemo(() => dados.faturas.map((f) => ({
    ...f, empresa: nomeDe.get(f.assinanteId)?.empresa ?? '(excluída)', plano: planoDe(dados, f.planoId)?.nome ?? '—',
    situacao: f.status === 'Em aberto' ? (vencida(f, hoje) ? 'Vencida' : 'A vencer') : f.status,
    atraso: f.status === 'Em aberto' ? Math.max(0, diffDays(hoje, f.vencimento)) : 0,
  })), [dados, nomeDe, hoje]);

  const filtradas = rows.filter((r) => (!situacao || r.situacao === situacao) && (!comp || r.competencia === comp) && (!q || normalize(r.empresa).includes(normalize(q))));
  const s = useSortPage<Row>(filtradas, 12, { key: 'vencimento', dir: 'desc' });

  const doMes = rows.filter((r) => r.competencia === mesAtual && r.status !== 'Cancelada');
  const recebidoMes = rows.filter((r) => r.status === 'Paga' && (r.pagoEm ?? '').startsWith(mesAtual));
  const aVencer = rows.filter((r) => r.situacao === 'A vencer');
  const vencidas = rows.filter((r) => r.situacao === 'Vencida');
  const soma = (xs: Row[]) => xs.reduce((t, r) => t + r.valor, 0);

  const pendentes = dados.assinantes.filter((a) => PAGANTE.includes(a.status) && !dados.faturas.some((f) => f.assinanteId === a.id && f.competencia === mesAtual));
  const paraInadimplencia = dados.assinantes.filter((a) => a.status === 'Ativa' && dados.faturas.some((f) => f.assinanteId === a.id && vencida(f, hoje) && diffDays(hoje, f.vencimento) > cfg.diasTolerancia));
  const paraSuspensao = dados.assinantes.filter((a) => a.status === 'Inadimplente' && dados.faturas.some((f) => f.assinanteId === a.id && vencida(f, hoje) && diffDays(hoje, f.vencimento) > cfg.diasTolerancia * 3));

  const gerarFaturas = () => {
    for (const a of pendentes) {
      salvar('faturas', {
        id: `f-${a.id}-${mesAtual}`, assinanteId: a.id, competencia: mesAtual, vencimento: `${mesAtual}-${pad(a.diaVencimento)}`,
        valor: mrrDe(a, dados), planoId: a.planoId, status: 'Em aberto',
      });
    }
    toast(`${pendentes.length} fatura(s) emitida(s): ${money(pendentes.reduce((t, a) => t + mrrDe(a, dados), 0))}.`);
  };

  const evento = (a: Assinante, tipo: string, det: string) => [...a.historico, { data: hoje, tipo, detalhe: det }];
  const aplicarRegua = () => {
    for (const a of paraInadimplencia) salvar('assinantes', { ...a, status: 'Inadimplente', historico: evento(a, 'Inadimplência', `Atraso acima de ${cfg.diasTolerancia} dias`) });
    for (const a of paraSuspensao) salvar('assinantes', { ...a, status: 'Suspensa', historico: evento(a, 'Suspensão', `Atraso acima de ${cfg.diasTolerancia * 3} dias`) });
    toast(`${paraInadimplencia.length} marcada(s) como inadimplente(s) e ${paraSuspensao.length} suspensa(s).`);
  };

  const strip = (r: Row): Fatura => { const { empresa: _e, plano: _p, situacao: _s, atraso: _a, ...f } = r; return f; };
  const pagar = (r: Row) => {
    salvar('faturas', { ...strip(r), status: 'Paga', pagoEm: hoje });
    const a = nomeDe.get(r.assinanteId);
    const outras = dados.faturas.some((f) => f.assinanteId === r.assinanteId && f.id !== r.id && vencida(f, hoje));
    if (a && (a.status === 'Inadimplente' || a.status === 'Suspensa') && !outras) {
      salvar('assinantes', { ...a, status: 'Ativa', historico: evento(a, 'Regularização', 'Faturas em dia: acesso normalizado') });
      toast(`Pagamento registrado. ${a.empresa} voltou a ficar ativa.`);
    } else toast('Pagamento registrado.');
  };

  const adimplencia = lastMonths(6).map((m) => {
    const xs = rows.filter((r) => r.competencia === m && r.status !== 'Cancelada');
    const pagas = xs.filter((r) => r.status === 'Paga');
    const noPrazo = pagas.filter((r) => (r.pagoEm ?? '') <= r.vencimento);
    return { m, fat: soma(xs), rec: soma(pagas), taxa: xs.length ? soma(pagas) / soma(xs) : null, prazo: pagas.length ? noPrazo.length / pagas.length : null };
  }).reverse();

  const competencias = [...new Set(rows.map((r) => r.competencia))].sort().reverse();
  const mesNome = MESES_LONGOS[Number(mesAtual.slice(5)) - 1];

  return (
    <>
      <PageHeader title="Faturamento da plataforma" subtitle="Cobranças mensais das empresas assinantes, recebimentos e régua de inadimplência.">
        <button className="btn" onClick={() => downloadCSV(`faturas-pivothub-${hoje}.csv`, [
          ['Empresa', 'Competência', 'Plano', 'Valor', 'Vencimento', 'Situação', 'Pago em'],
          ...filtradas.map((r) => [r.empresa, r.competencia, r.plano, r.valor.toFixed(2).replace('.', ','), r.vencimento, r.situacao, r.pagoEm ?? '']),
        ])}><Download size={16} /> Exportar</button>
        <button className="btn" disabled={!paraInadimplencia.length && !paraSuspensao.length} onClick={() => setRegua(true)}>
          <Gavel size={16} /> Aplicar régua{paraInadimplencia.length + paraSuspensao.length ? ` (${paraInadimplencia.length + paraSuspensao.length})` : ''}
        </button>
        <button className="btn btn-primary" disabled={!pendentes.length} onClick={() => setGerar(true)}>
          <Receipt size={16} /> Gerar faturas de {mesNome}{pendentes.length ? ` (${pendentes.length})` : ''}
        </button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<FileText size={20} />} tone="blue" label={`Faturado em ${mesNome}`} value={money(soma(doMes))} foot={`${doMes.length} fatura(s)${pendentes.length ? ` · ${pendentes.length} a emitir` : ''}`} />
        <Kpi icon={<CheckCircle2 size={20} />} tone="green" label="Recebido no mês" value={money(soma(recebidoMes))} foot={`${recebidoMes.length} pagamento(s)`} />
        <Kpi icon={<AlarmClock size={20} />} tone="purple" label="A vencer" value={money(soma(aVencer))} foot={`${aVencer.length} fatura(s) em aberto no prazo`} />
        <Kpi icon={<Wallet size={20} />} tone="red" label="Vencido" value={money(soma(vencidas))}
          foot={vencidas.length ? <span className="text-danger strong">{vencidas.length} fatura(s) · maior atraso {Math.max(...vencidas.map((r) => r.atraso))} dias</span> : <span className="text-success strong">Nada vencido</span>} />
      </div>

      <div className="grid g-3-2">
        <div className="card">
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar empresa..." />
            <select className="select" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas as situações</option>
              {['A vencer', 'Vencida', 'Paga', 'Cancelada'].map((x) => <option key={x}>{x}</option>)}
            </select>
            <select className="select" value={comp} onChange={(e) => setComp(e.target.value)}>
              <option value="">Todas as competências</option>
              {competencias.map((c) => <option key={c} value={c}>{monthLabel(c)}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <Th label="Empresa" k="empresa" s={s} />
                  <Th label="Competência" k="competencia" s={s} />
                  <Th label="Valor" k="valor" s={s} className="num" />
                  <Th label="Vencimento" k="vencimento" s={s} />
                  <Th label="Situação" k="situacao" s={s} />
                  <th className="right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {s.view.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.empresa}<div className="sub">{r.plano}</div></td>
                    <td>{monthLabel(r.competencia)}</td>
                    <td className="num strong">{money(r.valor)}</td>
                    <td className="nowrap">{date(r.vencimento)}{r.atraso > 0 && <div className="sub text-danger">{r.atraso} dia(s) de atraso</div>}</td>
                    <td>
                      <Badge tone={r.situacao === 'Paga' ? 'green' : r.situacao === 'Vencida' ? 'red' : r.situacao === 'Cancelada' ? 'gray' : 'blue'}>{r.situacao}</Badge>
                      {r.pagoEm && <div className="sub">em {date(r.pagoEm)}</div>}
                    </td>
                    <td className="right">
                      <RowMenu actions={[
                        { label: 'Registrar pagamento', onClick: () => pagar(r), hidden: r.status !== 'Em aberto' },
                        { label: 'Cancelar fatura', onClick: () => { salvar('faturas', { ...strip(r), status: 'Cancelada', pagoEm: undefined }); toast('Fatura cancelada.'); }, hidden: r.status === 'Cancelada' },
                        { label: 'Reabrir', onClick: () => { salvar('faturas', { ...strip(r), status: 'Em aberto', pagoEm: undefined }); toast('Fatura reaberta.'); }, hidden: r.status === 'Em aberto' },
                        { label: 'Excluir', danger: true, onClick: () => setExcluindo(r) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.total === 0 && <Empty text="Nenhuma fatura encontrada." />}
          </div>
          <Pager {...s} noun="faturas" />
        </div>

        <div className="card">
          <div className="card-head"><div><h3>Adimplência por competência</h3><div className="card-sub">Quanto do faturado já entrou no caixa e quanto foi pago no prazo</div></div></div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Mês</th><th className="num">Faturado</th><th className="num">Recebido</th><th className="num">No prazo</th></tr></thead>
              <tbody>
                {adimplencia.map((x) => (
                  <tr key={x.m}>
                    <td className="strong">{monthLabel(x.m)}</td>
                    <td className="num">{money(x.fat)}</td>
                    <td className={`num ${x.taxa !== null && x.taxa < 0.9 && x.m < mesAtual ? 'text-danger strong' : ''}`}>{x.taxa === null ? '—' : pct(x.taxa)}</td>
                    <td className="num">{x.prazo === null ? '—' : pct(x.prazo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-pad small muted">
            Régua atual: atraso acima de <strong>{cfg.diasTolerancia} dias</strong> → inadimplente; acima de <strong>{cfg.diasTolerancia * 3} dias</strong> → suspensão do acesso. Ao registrar o pagamento, a conta volta a ficar ativa automaticamente.
          </div>
        </div>
      </div>

      {gerar && <Confirm label="Emitir faturas" text={<>Emitir <strong>{pendentes.length}</strong> fatura(s) de {mesNome}, no total de <strong>{money(pendentes.reduce((t, a) => t + mrrDe(a, dados), 0))}</strong>, com vencimento no dia contratado de cada empresa?</>} onClose={() => setGerar(false)} onConfirm={gerarFaturas} />}
      {regua && <Confirm label="Aplicar régua" text={<>
        {paraInadimplencia.length > 0 && <>Marcar como <strong>inadimplente</strong>: {paraInadimplencia.map((a) => a.empresa).join(', ')}.<br /></>}
        {paraSuspensao.length > 0 && <>Suspender o acesso de: <strong>{paraSuspensao.map((a) => a.empresa).join(', ')}</strong>.</>}
      </>} onClose={() => setRegua(false)} onConfirm={aplicarRegua} />}
      {excluindo && <Confirm text={<>Excluir a fatura de <strong>{excluindo.empresa}</strong> ({monthLabel(excluindo.competencia)})? Para manter o histórico de receita, prefira cancelar.</>} onClose={() => setExcluindo(null)} onConfirm={() => { excluir('faturas', excluindo.id); toast('Fatura excluída.'); }} />}
    </>
  );
}
