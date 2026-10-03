import { useMemo, useState } from 'react';
import { CalendarClock, Lightbulb, Plus, Receipt, Repeat, TrendingDown } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import type { Contrato, TipoContrato } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../components/ui';
import { ClienteSelect, Field, Options, toNumber } from '../components/fields';
import { addDays, date, diffDays, MESES_LONGOS, money, normalize, pad, parseDate, pct, today, toISODate, uid } from '../utils/format';

const TIPOS: TipoContrato[] = ['Suporte mensal', 'Hospedagem de site', 'Manutenção preventiva', 'Domínio e e-mail'];
type Row = Contrato & { cliente: string; diasRenov: number; meses: number; acumulado: number; cobradoMes: boolean };

export default function Contratos() {
  const { db, upsert, remove, toast } = useStore();
  const nome = useClienteNome();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Ativo');
  const [editing, setEditing] = useState<Contrato | null>(null);
  const [deleting, setDeleting] = useState<Contrato | null>(null);
  const [gerar, setGerar] = useState(false);
  const hoje = today();
  const mesAtual = hoje.slice(0, 7);
  const dHoje = parseDate(hoje);

  const rows: Row[] = useMemo(() => db.contratos.map((c) => {
    const receitas = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.categoria === 'Recorrência' && l.clienteId === c.clienteId &&
      (l.contratoId ? l.contratoId === c.id : l.descricao.startsWith(c.tipo)));
    return {
      ...c, cliente: nome(c.clienteId), diasRenov: diffDays(c.renovacao, hoje),
      meses: Math.max(0, Math.round(diffDays(c.status === 'Cancelado' ? c.renovacao : hoje, c.inicio) / 30.4)),
      acumulado: receitas.reduce((a, l) => a + l.valor, 0),
      cobradoMes: (c.ultimaCobranca ?? '') >= mesAtual,
    };
  }), [db.contratos, db.lancamentos, nome, hoje, mesAtual]);

  const filtered = rows.filter((r) => (!status || r.status === status) && (!q || normalize(`${r.cliente} ${r.tipo} ${r.descricao}`).includes(normalize(q))));
  const s = useSortPage<Row>(filtered, 10, { key: 'diasRenov', dir: 'asc' });

  const ativos = rows.filter((r) => r.status === 'Ativo');
  const mrr = ativos.reduce((a, r) => a + r.valorMensal, 0);
  const renovando = ativos.filter((r) => r.diasRenov <= 60);
  const cancelados12 = rows.filter((r) => r.status === 'Cancelado' && r.renovacao >= addDays(hoje, -365));
  const mrrPerdido = cancelados12.reduce((a, r) => a + r.valorMensal, 0);
  const pendentes = ativos.filter((r) => !r.cobradoMes && r.inicio <= hoje);

  // Receita do mês anterior: quanto dela é recorrente (previsível)?
  const mesAnt = (() => { const x = new Date(dHoje.getFullYear(), dHoje.getMonth() - 1, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; })();
  const recAnt = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.data.startsWith(mesAnt));
  const shareRec = recAnt.length ? recAnt.filter((l) => l.categoria === 'Recorrência').reduce((a, l) => a + l.valor, 0) / recAnt.reduce((a, l) => a + l.valor, 0) : 0;

  // Potencial: clientes que compram com frequência e não têm contrato ativo
  const potenciais = useMemo(() => {
    const ini = addDays(hoje, -365);
    const comContrato = new Set(ativos.map((r) => r.clienteId));
    return db.clientes.filter((c) => c.status === 'Ativo' && !comContrato.has(c.id)).map((c) => {
      const compras = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.clienteId === c.id && l.data >= ini && l.categoria !== 'Recorrência');
      const meses = new Set(compras.map((l) => l.data.slice(0, 7))).size;
      return { c, n: compras.length, meses, mensal: compras.reduce((a, l) => a + l.valor, 0) / 12 };
    }).filter((x) => x.meses >= 4).sort((a, b) => b.mensal - a.mensal).slice(0, 4);
  }, [db.clientes, db.lancamentos, ativos, hoje]);

  const gerarCobrancas = () => {
    const [y, m] = mesAtual.split('-').map(Number);
    const ultimoDia = new Date(y, m, 0).getDate();
    for (const c of pendentes) {
      upsert('lancamentos', {
        id: uid(), tipo: 'Receita', descricao: `${c.tipo} - mensalidade`, categoria: 'Recorrência', valor: c.valorMensal,
        data: `${mesAtual}-${pad(Math.min(c.diaVencimento, ultimoDia))}`, status: 'Pendente', clienteId: c.clienteId, contratoId: c.id,
      });
      const { cliente: _c, diasRenov: _d, meses: _m, acumulado: _a, cobradoMes: _b, ...contrato } = c;
      upsert('contratos', { ...contrato, ultimaCobranca: mesAtual });
    }
    toast(`${pendentes.length} cobrança(s) geradas como pendentes no financeiro (${money(pendentes.reduce((a, c) => a + c.valorMensal, 0))}).`);
  };

  const strip = (r: Row): Contrato => {
    const { cliente: _c, diasRenov: _d, meses: _m, acumulado: _a, cobradoMes: _b, ...c } = r;
    return c;
  };
  const renovar = (r: Row) => {
    const base = parseDate(r.renovacao > hoje ? r.renovacao : hoje);
    upsert('contratos', { ...strip(r), status: 'Ativo', renovacao: toISODate(new Date(base.getFullYear() + 1, base.getMonth(), base.getDate())) });
    toast(`Contrato de ${r.cliente} renovado por 12 meses.`);
  };

  return (
    <>
      <PageHeader title="Contratos Recorrentes" subtitle="Suporte mensal, hospedagem, manutenção preventiva e domínios: a receita previsível do negócio.">
        <button className="btn" onClick={() => setGerar(true)} disabled={!pendentes.length}>
          <Receipt size={16} /> Gerar cobranças de {MESES_LONGOS[dHoje.getMonth()]}{pendentes.length ? ` (${pendentes.length})` : ''}
        </button>
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), clienteId: '', tipo: 'Suporte mensal', descricao: '', valorMensal: 0, inicio: hoje, renovacao: addDays(hoje, 365), diaVencimento: 10, status: 'Ativo' })}>
          <Plus size={16} /> Novo contrato
        </button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<Repeat size={20} />} tone="blue" label="Receita recorrente mensal (MRR)" value={money(mrr)} foot={`${ativos.length} contratos ativos · ${money(mrr * 12)}/ano`} />
        <Kpi icon={<Receipt size={20} />} tone="green" label="Peso na receita" value={pct(shareRec)} foot={`da receita de ${MESES_LONGOS[parseDate(`${mesAnt}-01`).getMonth()]} veio de contratos`}>
          <div className="meter"><span style={{ width: `${Math.min(100, shareRec * 100)}%`, background: 'var(--success)' }} /></div>
        </Kpi>
        <Kpi icon={<CalendarClock size={20} />} tone="orange" label="Renovações em 60 dias" value={renovando.length}
          foot={renovando.length ? <span className="text-warning strong">{money(renovando.reduce((a, r) => a + r.valorMensal, 0))}/mês em jogo</span> : 'Nenhuma renovação próxima'} />
        <Kpi icon={<TrendingDown size={20} />} tone="red" label="Cancelamentos (12 meses)" value={cancelados12.length}
          foot={cancelados12.length ? `${money(mrrPerdido)}/mês perdidos · churn ${pct(mrrPerdido / (mrr + mrrPerdido || 1))}` : 'Nenhum cancelamento'} />
      </div>

      {potenciais.length > 0 && (
        <div className="insight opp" style={{ marginBottom: 16 }}>
          <div className="ico tone-blue"><Lightbulb size={16} /></div>
          <div>
            <div className="t">Clientes com perfil para contrato de suporte</div>
            <div className="d">Compraram em 4 ou mais meses do último ano, mas não têm contrato ativo. Converter o gasto avulso em mensalidade aumenta a previsibilidade e a retenção.</div>
            {potenciais.map((p) => (
              <div key={p.c.id} className="d">• <strong>{p.c.nome}</strong>: {p.n} compras em {p.meses} meses · média de {money(p.mensal)}/mês</div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente ou tipo..." />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option><Options items={['Ativo', 'Suspenso', 'Cancelado'] as const} /></select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Cliente" k="cliente" s={s} />
                <Th label="Tipo" k="tipo" s={s} />
                <Th label="Mensalidade" k="valorMensal" s={s} className="num" />
                <Th label="Renovação" k="diasRenov" s={s} />
                <Th label="Tempo" k="meses" s={s} className="num hide-sm" />
                <Th label="Recebido" k="acumulado" s={s} className="num hide-sm" />
                <th>Cobrança do mês</th>
                <Th label="Status" k="status" s={s} />
                <th className="right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.view.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.cliente}</td>
                  <td>{r.tipo}<div className="sub">{r.descricao}</div></td>
                  <td className="num strong">{money(r.valorMensal)}<div className="sub">dia {r.diaVencimento}</div></td>
                  <td className="nowrap">
                    {date(r.renovacao)}
                    {r.status === 'Ativo' && <div className={`sub ${r.diasRenov < 0 ? 'text-danger' : r.diasRenov <= 30 ? 'text-warning' : ''}`}>{r.diasRenov < 0 ? `vencido há ${-r.diasRenov} dias` : `em ${r.diasRenov} dias`}</div>}
                  </td>
                  <td className="num hide-sm">{r.meses} meses</td>
                  <td className="num hide-sm">{money(r.acumulado)}</td>
                  <td>{r.status !== 'Ativo' ? '—' : r.cobradoMes ? <Badge tone="green">Gerada</Badge> : <Badge tone="orange">A gerar</Badge>}</td>
                  <td><Badge tone={r.status === 'Ativo' ? 'green' : r.status === 'Suspenso' ? 'orange' : 'gray'}>{r.status}</Badge></td>
                  <td className="right">
                    <RowMenu actions={[
                      { label: 'Editar', onClick: () => setEditing(strip(r)) },
                      { label: 'Renovar por 12 meses', onClick: () => renovar(r), hidden: r.status === 'Cancelado' },
                      { label: 'Suspender', onClick: () => { upsert('contratos', { ...strip(r), status: 'Suspenso' }); toast('Contrato suspenso.'); }, hidden: r.status !== 'Ativo' },
                      { label: 'Reativar', onClick: () => { upsert('contratos', { ...strip(r), status: 'Ativo' }); toast('Contrato reativado.'); }, hidden: r.status === 'Ativo' },
                      { label: 'Cancelar contrato', onClick: () => { upsert('contratos', { ...strip(r), status: 'Cancelado', renovacao: hoje }); toast('Contrato cancelado.'); }, hidden: r.status === 'Cancelado' },
                      { label: 'Excluir', danger: true, onClick: () => setDeleting(r) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhum contrato encontrado." />}
        </div>
        <Pager {...s} noun="contratos" />
      </div>

      {editing && <ContratoForm c={editing} onClose={() => setEditing(null)} onSave={(c) => {
        if (!c.clienteId || c.valorMensal <= 0) return toast('Informe cliente e valor mensal.', 'error');
        upsert('contratos', c); toast('Contrato salvo.'); setEditing(null);
      }} />}
      {gerar && <Confirm label="Gerar cobranças" text={<>Gerar <strong>{pendentes.length}</strong> cobrança(s) de {MESES_LONGOS[dHoje.getMonth()]} como receitas pendentes, no total de <strong>{money(pendentes.reduce((a, c) => a + c.valorMensal, 0))}</strong>?</>} onClose={() => setGerar(false)} onConfirm={gerarCobrancas} />}
      {deleting && <Confirm text={<>Excluir o contrato de <strong>{nome(deleting.clienteId)}</strong>? Para manter o histórico de churn, prefira "Cancelar contrato".</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('contratos', deleting.id); toast('Contrato excluído.'); }} />}
    </>
  );
}

function ContratoForm({ c, onClose, onSave }: { c: Contrato; onClose: () => void; onSave: (c: Contrato) => void }) {
  const [f, setF] = useState(c);
  const set = <K extends keyof Contrato>(k: K, v: Contrato[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={c.clienteId ? 'Editar contrato' : 'Novo contrato'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="ct-form">Salvar</button>
    </>}>
      <form id="ct-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Cliente" full><ClienteSelect value={f.clienteId} onChange={(v) => set('clienteId', v)} /></Field>
        <Field label="Tipo"><select className="select" value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoContrato)}><Options items={TIPOS} /></select></Field>
        <Field label="Mensalidade (R$)"><input className="input" inputMode="decimal" defaultValue={f.valorMensal ? String(f.valorMensal).replace('.', ',') : ''} onChange={(e) => set('valorMensal', toNumber(e.target.value))} required /></Field>
        <Field label="Escopo / descrição" full><input className="input" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex.: suporte remoto até 8h/mês" /></Field>
        <Field label="Início"><input className="input" type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} /></Field>
        <Field label="Renovação / término"><input className="input" type="date" value={f.renovacao} onChange={(e) => set('renovacao', e.target.value)} /></Field>
        <Field label="Dia de vencimento"><input className="input" type="number" min={1} max={31} value={f.diaVencimento} onChange={(e) => set('diaVencimento', Number(e.target.value))} /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Contrato['status'])}><Options items={['Ativo', 'Suspenso', 'Cancelado'] as const} /></select></Field>
      </form>
    </Modal>
  );
}
