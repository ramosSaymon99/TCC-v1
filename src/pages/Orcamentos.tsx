import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Download, FileText, Percent, Plus, Printer, Send, Wallet, X } from 'lucide-react';
import { imprimirProposta } from '../utils/print';
import { useClienteNome, useStore } from '../store/Store';
import type { CategoriaServico, Orcamento, StatusOrcamento } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../components/ui';
import { ClienteSelect, Field, Options, toNumber } from '../components/fields';
import { addDays, date, downloadCSV, lastMonths, money, monthKey, monthLabel, normalize, pct, today, uid } from '../utils/format';
import { CATEGORIAS } from '../store/seed';

const ABERTOS: StatusOrcamento[] = ['Orçamento', 'Em análise', 'Proposta enviada'];
const TABS = [
  { k: 'todos', l: 'Todos', f: () => true },
  { k: 'orcamentos', l: 'Orçamentos', f: (o: Orcamento) => o.status === 'Orçamento' || o.status === 'Em análise' },
  { k: 'propostas', l: 'Propostas', f: (o: Orcamento) => o.status === 'Proposta enviada' },
  { k: 'convertidos', l: 'Convertidos', f: (o: Orcamento) => o.status === 'Convertido' },
  { k: 'recusados', l: 'Recusados', f: (o: Orcamento) => o.status === 'Recusado' },
] as const;

type Row = Orcamento & { cliente: string; situacao: string };

export default function Orcamentos() {
  const { db, upsert, remove, toast } = useStore();
  const nome = useClienteNome();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<string>(params.get('tab') ?? 'todos');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mes, setMes] = useState('');
  const [editing, setEditing] = useState<Orcamento | null>(null);
  const [deleting, setDeleting] = useState<Orcamento | null>(null);
  const filtro = params.get('filtro');
  const hoje = today();
  const lim = addDays(hoje, db.empresa.diasAlertaOrcamento);

  const rows: Row[] = useMemo(() => db.orcamentos.map((o) => {
    const aberto = ABERTOS.includes(o.status);
    const situacao = !aberto ? '' : o.validade < hoje ? 'Vencido' : o.validade <= lim ? 'Vence em breve' : '';
    return { ...o, cliente: nome(o.clienteId), situacao };
  }), [db.orcamentos, nome, hoje, lim]);

  const tabDef = TABS.find((t) => t.k === tab) ?? TABS[0];
  const filtered = rows.filter((o) => tabDef.f(o) &&
    (!q || normalize(`${o.numero} ${o.cliente} ${o.servico}`).includes(normalize(q))) &&
    (!status || o.status === status) && (!mes || monthKey(o.criadoEm) === mes) &&
    (filtro !== 'vencendo' || o.situacao === 'Vence em breve'));
  const s = useSortPage<Row>(filtered, 8, { key: 'numero', dir: 'desc' });

  // Indicadores
  const abertos = rows.filter((o) => ABERTOS.includes(o.status));
  const decididos = rows.filter((o) => o.status === 'Convertido' || o.status === 'Recusado');
  const convertidos = rows.filter((o) => o.status === 'Convertido');
  const taxa = decididos.length ? convertidos.length / decididos.length : 0;
  const vencendo = rows.filter((o) => o.situacao === 'Vence em breve');

  const setStatusOrc = (o: Orcamento, st: StatusOrcamento) => {
    upsert('orcamentos', { ...o, status: st });
    toast(`${o.numero}: ${st}.`);
  };
  const converter = (o: Orcamento) => {
    const n = db.ordens.reduce((m, x) => Math.max(m, Number(x.numero.replace(/\D/g, '')) || 0), 0) + 1;
    const os = {
      id: uid(), numero: `OS-${String(n).padStart(3, '0')}`, clienteId: o.clienteId, servico: o.servico, categoria: o.categoria,
      abertura: hoje, prazo: addDays(hoje, 7), status: 'Aberta' as const, valor: o.valor, descricao: `Gerada a partir de ${o.numero}`,
    };
    upsert('ordens', os);
    upsert('orcamentos', { ...o, status: 'Convertido' });
    toast(`${o.numero} convertido em ${os.numero}.`);
  };
  const exportar = () => downloadCSV('orcamentos.csv', [
    ['Nº', 'Cliente', 'Serviço', 'Categoria', 'Valor', 'Criado em', 'Validade', 'Status'],
    ...filtered.map((o) => [o.numero, o.cliente, o.servico, o.categoria, o.valor.toFixed(2).replace('.', ','), date(o.criadoEm), date(o.validade), o.status]),
  ]);
  const novo = (): Orcamento => {
    const n = db.orcamentos.reduce((m, x) => Math.max(m, Number(x.numero.replace(/\D/g, '')) || 0), 0) + 1;
    return { id: uid(), numero: `OR-${String(n).padStart(3, '0')}`, clienteId: '', servico: '', categoria: 'Manutenção', valor: 0, criadoEm: hoje, validade: addDays(hoje, 15), status: 'Orçamento' };
  };

  return (
    <>
      <PageHeader title="Orçamentos e Propostas" subtitle="Crie, acompanhe e gerencie seus orçamentos e propostas.">
        <button className="btn" onClick={exportar}><Download size={16} /> Exportar</button>
        <button className="btn btn-primary" onClick={() => setEditing(novo())}><Plus size={16} /> Novo orçamento</button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<Wallet size={20} />} tone="blue" label="Valor em aberto" value={money(abertos.reduce((a, o) => a + o.valor, 0))} foot={`${abertos.length} orçamento(s) aguardando decisão`} />
        <Kpi icon={<Percent size={20} />} tone="green" label="Taxa de conversão" value={pct(taxa)} foot={`${convertidos.length} de ${decididos.length} decididos`} />
        <Kpi icon={<FileText size={20} />} tone="purple" label="Ticket médio convertido" value={money(convertidos.length ? convertidos.reduce((a, o) => a + o.valor, 0) / convertidos.length : 0)} foot="Valor médio dos fechados" />
        <Kpi icon={<Clock size={20} />} tone="orange" label="Vencem em breve" value={vencendo.length}
          foot={vencendo.length ? <span className="text-warning strong">{money(vencendo.reduce((a, o) => a + o.valor, 0))} em risco</span> : 'Nenhum a vencer'} />
      </div>

      <div className="card">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
              {t.l}<span className="count">{rows.filter(t.f).length}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente, serviço ou número..." />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <Options items={['Orçamento', 'Em análise', 'Proposta enviada', 'Convertido', 'Recusado'] as const} />
          </select>
          <select className="select" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {lastMonths(6).reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {filtro === 'vencendo' && (
            <button className="btn btn-sm btn-outline-primary" onClick={() => { params.delete('filtro'); setParams(params); }}>Vencendo em breve <X size={14} /></button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Nº" k="numero" s={s} />
                <Th label="Cliente" k="cliente" s={s} />
                <Th label="Serviço" k="servico" s={s} />
                <Th label="Valor" k="valor" s={s} className="num" />
                <Th label="Validade" k="validade" s={s} />
                <Th label="Status" k="status" s={s} />
                <th className="right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.view.map((o) => (
                <tr key={o.id}>
                  <td className="strong">{o.numero}</td>
                  <td>{o.cliente}</td>
                  <td>{o.servico}<div className="sub">{o.categoria}</div></td>
                  <td className="num strong">{money(o.valor)}</td>
                  <td className="nowrap">{date(o.validade)}{o.situacao && <div className={`sub ${o.situacao === 'Vencido' ? 'text-danger' : 'text-warning'}`}>{o.situacao}</div>}</td>
                  <td><Badge>{o.status}</Badge></td>
                  <td className="right">
                    <RowMenu actions={[
                      { label: 'Editar', onClick: () => setEditing(o) },
                      { label: <><Printer size={14} /> Gerar proposta (PDF)</>, onClick: () => imprimirProposta(o, db.clientes.find((c) => c.id === o.clienteId), db.empresa) },
                      { label: <><Send size={14} /> Marcar proposta enviada</>, onClick: () => setStatusOrc(o, 'Proposta enviada'), hidden: !ABERTOS.includes(o.status) || o.status === 'Proposta enviada' },
                      { label: <><CheckCircle2 size={14} /> Converter em OS</>, onClick: () => converter(o), hidden: !ABERTOS.includes(o.status) },
                      { label: 'Marcar como recusado', onClick: () => setStatusOrc(o, 'Recusado'), hidden: !ABERTOS.includes(o.status) },
                      { label: 'Ver ordens de serviço', onClick: () => nav('/ordens'), hidden: o.status !== 'Convertido' },
                      { label: 'Excluir', onClick: () => setDeleting(o), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhum orçamento encontrado." />}
        </div>
        <Pager {...s} noun="orçamentos" />
      </div>

      {editing && <OrcamentoForm o={editing} onClose={() => setEditing(null)} onSave={(o) => {
        if (!o.clienteId || !o.servico) return toast('Preencha cliente e serviço.', 'error');
        upsert('orcamentos', o); toast('Orçamento salvo.'); setEditing(null);
      }} />}
      {deleting && <Confirm text={<>Excluir o orçamento <strong>{deleting.numero}</strong>?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('orcamentos', deleting.id); toast('Orçamento excluído.'); }} />}
    </>
  );
}

function OrcamentoForm({ o, onClose, onSave }: { o: Orcamento; onClose: () => void; onSave: (o: Orcamento) => void }) {
  const { db } = useStore();
  const [f, setF] = useState(o);
  const [vk, setVk] = useState(0); // remonta o campo de valor quando o catálogo preenche o preço
  const catalogo = db.servicos.filter((s) => s.ativo);
  const tabela = db.servicos.find((s) => s.nome === f.servico);
  const set = <K extends keyof Orcamento>(k: K, v: Orcamento[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={`${o.servico ? 'Editar' : 'Novo'} orçamento · ${o.numero}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="orc-form">Salvar</button>
    </>}>
      <form id="orc-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Cliente" full><ClienteSelect value={f.clienteId} onChange={(v) => set('clienteId', v)} /></Field>
        <Field label="Do catálogo" full hint="Preenche serviço, categoria e preço de tabela. Pode ajustar depois.">
          <select className="select" value={catalogo.some((s) => s.nome === f.servico) ? f.servico : ''} onChange={(e) => {
            const s = catalogo.find((x) => x.nome === e.target.value);
            if (s) { setF((x) => ({ ...x, servico: s.nome, categoria: s.categoria, valor: s.preco })); setVk((k) => k + 1); }
          }}>
            <option value="">Serviço personalizado</option>
            {catalogo.map((s) => <option key={s.id} value={s.nome}>{s.nome} · {money(s.preco)}</option>)}
          </select>
        </Field>
        <Field label="Serviço"><input className="input" value={f.servico} onChange={(e) => set('servico', e.target.value)} required /></Field>
        <Field label="Categoria">
          <select className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value as CategoriaServico)}><Options items={CATEGORIAS} /></select>
        </Field>
        <Field label="Valor (R$)" hint={tabela && f.valor < tabela.preco ? `Desconto de ${pct((tabela.preco - f.valor) / tabela.preco)} sobre a tabela (${money(tabela.preco)}).` : undefined}>
          <input key={vk} className="input" inputMode="decimal" defaultValue={f.valor ? String(f.valor).replace('.', ',') : ''} onChange={(e) => set('valor', toNumber(e.target.value))} required />
        </Field>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as StatusOrcamento)}>
            <Options items={['Orçamento', 'Em análise', 'Proposta enviada', 'Convertido', 'Recusado'] as const} />
          </select>
        </Field>
        <Field label="Data de criação"><input className="input" type="date" value={f.criadoEm} onChange={(e) => set('criadoEm', e.target.value)} /></Field>
        <Field label="Validade"><input className="input" type="date" value={f.validade} onChange={(e) => set('validade', e.target.value)} /></Field>
        <Field label="Descrição / escopo" full><textarea className="textarea" value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
