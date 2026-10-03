import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Download, Package, Pencil, Plus, ShoppingCart, Trash2, Wrench } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import type { Movimento, Peca } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../components/ui';
import { Field, Options, toNumber } from '../components/fields';
import { addDays, date, downloadCSV, int, money, normalize, today, uid } from '../utils/format';
import { ABERTAS } from '../utils/metrics';

const CATS: Peca['categoria'][] = ['Armazenamento', 'Memória', 'Energia', 'Periféricos', 'Rede', 'Outros'];
type Situacao = 'Zerado' | 'Abaixo do mínimo' | 'Sem giro' | 'OK';
type Row = Peca & { consumo90: number; cobertura: number | null; valor: number; sugestao: number; situacao: Situacao; rank: number };
const RANK: Record<Situacao, number> = { Zerado: 0, 'Abaixo do mínimo': 1, OK: 2, 'Sem giro': 3 };
const SIT_TONE: Record<Situacao, string> = { Zerado: 'red', 'Abaixo do mínimo': 'orange', 'Sem giro': 'gray', OK: 'green' };

export default function Estoque() {
  const { db, upsert, remove, toast } = useStore();
  const nomeCliente = useClienteNome();
  const [tab, setTab] = useState<'pecas' | 'mov'>('pecas');
  const [q, setQ] = useState('');
  const [sit, setSit] = useState('');
  const [editing, setEditing] = useState<Peca | null>(null);
  const [deleting, setDeleting] = useState<Peca | null>(null);
  const [mov, setMov] = useState<{ peca: Peca; tipo: Movimento['tipo'] } | null>(null);
  const hoje = today();

  const rows: Row[] = useMemo(() => {
    const ini = addDays(hoje, -90);
    return db.pecas.map((p) => {
      const consumo90 = db.movimentos.filter((m) => m.pecaId === p.id && m.tipo === 'Saída' && m.data >= ini).reduce((a, m) => a + m.quantidade, 0);
      const diario = consumo90 / 90;
      const alvo = Math.max(p.minimo * 2, Math.ceil(diario * 45)); // estoque para ~45 dias, nunca abaixo de 2× o mínimo
      const situacao: Situacao = p.quantidade <= 0 ? 'Zerado' : p.quantidade < p.minimo ? 'Abaixo do mínimo' : consumo90 === 0 ? 'Sem giro' : 'OK';
      return {
        ...p, consumo90, valor: p.quantidade * p.custoUnit,
        cobertura: diario > 0 ? p.quantidade / diario : null,
        sugestao: p.quantidade < p.minimo ? Math.max(0, alvo - p.quantidade) : 0,
        situacao, rank: RANK[situacao],
      };
    });
  }, [db.pecas, db.movimentos, hoje]);

  const filtered = rows.filter((r) => (!sit || r.situacao === sit) && (!q || normalize(`${r.nome} ${r.sku} ${r.fornecedor ?? ''}`).includes(normalize(q))));
  const s = useSortPage<Row>(filtered, 10, { key: 'rank', dir: 'asc' });

  const valorTotal = rows.reduce((a, r) => a + r.valor, 0);
  const criticos = rows.filter((r) => r.situacao === 'Zerado' || r.situacao === 'Abaixo do mínimo');
  const compra = criticos.filter((r) => r.sugestao > 0);
  const valorCompra = compra.reduce((a, r) => a + r.sugestao * r.custoUnit, 0);
  const aguardando = db.ordens.filter((o) => o.status === 'Aguardando peças');
  const semGiro = rows.filter((r) => r.situacao === 'Sem giro');

  const movs = [...db.movimentos].sort((a, b) => b.data.localeCompare(a.data));
  const sm = useSortPage<Movimento>(movs, 12);
  const pecaNome = (id: string) => db.pecas.find((p) => p.id === id)?.nome ?? '—';
  const osNum = (id?: string) => (id ? db.ordens.find((o) => o.id === id)?.numero ?? '—' : '—');

  const registrar = (p: Peca, m: Movimento, lancarDespesa: boolean) => {
    const delta = m.tipo === 'Entrada' ? m.quantidade : -m.quantidade;
    if (m.tipo === 'Saída' && m.quantidade > p.quantidade) return toast(`Estoque insuficiente: há ${p.quantidade} unidade(s).`, 'error');
    upsert('movimentos', m);
    upsert('pecas', { ...p, quantidade: p.quantidade + delta, custoUnit: m.tipo === 'Entrada' && m.custoUnit ? m.custoUnit : p.custoUnit });
    if (m.tipo === 'Entrada' && lancarDespesa) {
      upsert('lancamentos', { id: uid(), tipo: 'Despesa', descricao: `${p.nome} (${m.quantidade} un.)`, categoria: 'Peças e acessórios', valor: Math.round(m.quantidade * (m.custoUnit ?? p.custoUnit) * 100) / 100, data: m.data, status: 'Pago' });
    }
    toast(m.tipo === 'Entrada' ? `Entrada de ${m.quantidade} un. registrada${lancarDespesa ? ' e despesa lançada' : ''}.` : `Saída de ${m.quantidade} un. registrada.`);
    setMov(null);
  };

  const listaCompras = () => downloadCSV(`lista-compras-${hoje}.csv`, [
    ['Peça', 'SKU', 'Fornecedor', 'Estoque', 'Mínimo', 'Comprar', 'Custo unit.', 'Total'],
    ...compra.map((r) => [r.nome, r.sku, r.fornecedor ?? '', r.quantidade, r.minimo, r.sugestao, r.custoUnit.toFixed(2).replace('.', ','), (r.sugestao * r.custoUnit).toFixed(2).replace('.', ',')]),
  ]);

  return (
    <>
      <PageHeader title="Estoque de Peças" subtitle="Controle de peças e acessórios usados nas manutenções, com alertas de reposição baseados no consumo real.">
        <button className="btn" onClick={listaCompras} disabled={!compra.length}><ShoppingCart size={16} /> Lista de compras</button>
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), nome: '', categoria: 'Outros', sku: `PC-${String(db.pecas.length + 1).padStart(3, '0')}`, quantidade: 0, minimo: 1, custoUnit: 0, precoVenda: 0 })}>
          <Plus size={16} /> Nova peça
        </button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<Boxes size={20} />} tone="blue" label="Valor em estoque" value={money(valorTotal)} foot={`${rows.length} itens · ${int(rows.reduce((a, r) => a + r.quantidade, 0))} unidades`} />
        <Kpi icon={<AlertTriangle size={20} />} tone="red" label="Abaixo do mínimo" value={criticos.length}
          foot={criticos.length ? <span className="text-danger strong">{rows.filter((r) => r.situacao === 'Zerado').length} zerado(s)</span> : 'Estoque saudável'} />
        <Kpi icon={<ShoppingCart size={20} />} tone="orange" label="Compra sugerida" value={money(valorCompra)} foot={`${compra.length} item(ns) para repor ~45 dias de consumo`} />
        <Kpi icon={<Wrench size={20} />} tone="purple" label="OS aguardando peças" value={aguardando.length}
          foot={aguardando.length ? `${money(aguardando.reduce((a, o) => a + o.valor, 0))} travados` : 'Nenhuma OS parada'} />
      </div>

      {(aguardando.length > 0 || semGiro.length > 0) && (
        <div className="insight warn" style={{ marginBottom: 16 }}>
          <div className="ico tone-orange"><AlertTriangle size={16} /></div>
          <div>
            {aguardando.length > 0 && <div className="d">• {aguardando.map((o) => `${o.numero} (${nomeCliente(o.clienteId)})`).join(', ')} aguardando peças: {money(aguardando.reduce((a, o) => a + o.valor, 0))} de receita parada. Priorize a compra dos itens zerados.</div>}
            {semGiro.length > 0 && <div className="d">• {semGiro.length} item(ns) sem saída em 90 dias ({money(semGiro.reduce((a, r) => a + r.valor, 0))} parados): {semGiro.map((r) => r.nome).join(', ')}. Evite recompra.</div>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="tabs">
          <button className={`tab ${tab === 'pecas' ? 'active' : ''}`} onClick={() => setTab('pecas')}>Peças<span className="count">{rows.length}</span></button>
          <button className={`tab ${tab === 'mov' ? 'active' : ''}`} onClick={() => setTab('mov')}>Movimentações<span className="count">{movs.length}</span></button>
        </div>

        {tab === 'pecas' ? (
          <>
            <div className="toolbar">
              <SearchInput value={q} onChange={setQ} placeholder="Buscar por peça, SKU ou fornecedor..." />
              <select className="select" value={sit} onChange={(e) => setSit(e.target.value)}><option value="">Todas as situações</option><Options items={['Zerado', 'Abaixo do mínimo', 'Sem giro', 'OK'] as const} /></select>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <Th label="Peça" k="nome" s={s} />
                    <Th label="Estoque" k="quantidade" s={s} className="num" />
                    <Th label="Mínimo" k="minimo" s={s} className="num hide-sm" />
                    <Th label="Consumo 90d" k="consumo90" s={s} className="num hide-sm" />
                    <Th label="Cobertura" k="cobertura" s={s} className="num" />
                    <Th label="Valor" k="valor" s={s} className="num hide-sm" />
                    <Th label="Comprar" k="sugestao" s={s} className="num" />
                    <Th label="Situação" k="rank" s={s} />
                    <th className="right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {s.view.map((r) => (
                    <tr key={r.id}>
                      <td><div className="row"><Package size={15} color="var(--muted)" /><div><div className="strong">{r.nome}</div><div className="sub">{r.sku} · {r.categoria}{r.fornecedor ? ` · ${r.fornecedor}` : ''}</div></div></div></td>
                      <td className={`num strong ${r.quantidade < r.minimo ? 'text-danger' : ''}`}>{int(r.quantidade)}</td>
                      <td className="num hide-sm">{int(r.minimo)}</td>
                      <td className="num hide-sm">{int(r.consumo90)}</td>
                      <td className={`num ${r.cobertura !== null && r.cobertura < 15 ? 'text-danger strong' : ''}`}>{r.cobertura === null ? '—' : `${Math.round(r.cobertura)} dias`}</td>
                      <td className="num hide-sm">{money(r.valor)}</td>
                      <td className="num strong">{r.sugestao ? `${int(r.sugestao)} un.` : '—'}{r.sugestao > 0 && <div className="sub">{money(r.sugestao * r.custoUnit)}</div>}</td>
                      <td><Badge tone={SIT_TONE[r.situacao]}>{r.situacao}</Badge></td>
                      <td className="right">
                        <RowMenu actions={[
                          { label: <><ArrowDownToLine size={14} /> Entrada (compra)</>, onClick: () => setMov({ peca: r, tipo: 'Entrada' }) },
                          { label: <><ArrowUpFromLine size={14} /> Saída (uso em OS)</>, onClick: () => setMov({ peca: r, tipo: 'Saída' }), hidden: r.quantidade <= 0 },
                          { label: <><Pencil size={14} /> Editar</>, onClick: () => setEditing(r) },
                          { label: <><Trash2 size={14} /> Excluir</>, danger: true, onClick: () => setDeleting(r) },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.total === 0 && <Empty text="Nenhuma peça encontrada." />}
            </div>
            <Pager {...s} noun="peças" />
          </>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => downloadCSV('movimentacoes-estoque.csv', [
                ['Data', 'Peça', 'Tipo', 'Quantidade', 'OS', 'Observação'],
                ...movs.map((m) => [date(m.data), pecaNome(m.pecaId), m.tipo, m.quantidade, osNum(m.osId), m.obs ?? '']),
              ])}><Download size={14} /> Exportar</button>
            </div>
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><Th label="Data" k="data" s={sm} /><th>Peça</th><Th label="Tipo" k="tipo" s={sm} /><Th label="Qtd." k="quantidade" s={sm} className="num" /><th>OS</th><th className="hide-sm">Observação</th></tr></thead>
                <tbody>
                  {sm.view.map((m) => (
                    <tr key={m.id}>
                      <td className="nowrap">{date(m.data)}</td>
                      <td className="strong">{pecaNome(m.pecaId)}</td>
                      <td><Badge tone={m.tipo === 'Entrada' ? 'green' : 'blue'}>{m.tipo}</Badge></td>
                      <td className="num">{m.tipo === 'Entrada' ? '+' : '−'}{int(m.quantidade)}</td>
                      <td>{osNum(m.osId)}</td>
                      <td className="hide-sm muted">{m.obs ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sm.total === 0 && <Empty text="Nenhuma movimentação." />}
            </div>
            <Pager {...sm} noun="movimentações" />
          </>
        )}
      </div>

      {editing && <PecaForm p={editing} onClose={() => setEditing(null)} onSave={(p) => {
        if (!p.nome) return toast('Informe o nome da peça.', 'error');
        upsert('pecas', p); toast('Peça salva.'); setEditing(null);
      }} />}
      {mov && <MovForm peca={mov.peca} tipo={mov.tipo} onClose={() => setMov(null)} onSave={registrar} />}
      {deleting && <Confirm text={<>Excluir <strong>{deleting.nome}</strong> do estoque?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('pecas', deleting.id); toast('Peça excluída.'); }} />}
    </>
  );
}

function PecaForm({ p, onClose, onSave }: { p: Peca; onClose: () => void; onSave: (p: Peca) => void }) {
  const [f, setF] = useState(p);
  const set = <K extends keyof Peca>(k: K, v: Peca[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={p.nome ? 'Editar peça' : 'Nova peça'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="peca-form">Salvar</button>
    </>}>
      <form id="peca-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Nome" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Field>
        <Field label="SKU / código"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Categoria"><select className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value as Peca['categoria'])}><Options items={CATS} /></select></Field>
        <Field label="Quantidade atual" hint="Para entradas e saídas, use as ações da lista."><input className="input" type="number" min={0} value={f.quantidade} onChange={(e) => set('quantidade', Number(e.target.value))} /></Field>
        <Field label="Estoque mínimo"><input className="input" type="number" min={0} value={f.minimo} onChange={(e) => set('minimo', Number(e.target.value))} /></Field>
        <Field label="Custo unitário (R$)"><input className="input" inputMode="decimal" defaultValue={f.custoUnit ? String(f.custoUnit).replace('.', ',') : ''} onChange={(e) => set('custoUnit', toNumber(e.target.value))} /></Field>
        <Field label="Preço de venda (R$)"><input className="input" inputMode="decimal" defaultValue={f.precoVenda ? String(f.precoVenda).replace('.', ',') : ''} onChange={(e) => set('precoVenda', toNumber(e.target.value))} /></Field>
        <Field label="Fornecedor" full><input className="input" value={f.fornecedor ?? ''} onChange={(e) => set('fornecedor', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function MovForm({ peca, tipo, onClose, onSave }: {
  peca: Peca; tipo: Movimento['tipo']; onClose: () => void; onSave: (p: Peca, m: Movimento, lancar: boolean) => void;
}) {
  const { db } = useStore();
  const nome = useClienteNome();
  const [f, setF] = useState<Movimento>({ id: uid(), pecaId: peca.id, tipo, quantidade: 1, data: today(), custoUnit: peca.custoUnit });
  const [lancar, setLancar] = useState(true);
  const ordens = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status) || o.abertura >= addDays(today(), -30));
  return (
    <Modal title={`${tipo === 'Entrada' ? 'Entrada' : 'Saída'} · ${peca.nome}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="mov-form">Registrar</button>
    </>}>
      <form id="mov-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(peca, f, lancar); }}>
        <div className="full small muted">Estoque atual: <strong>{peca.quantidade}</strong> · mínimo {peca.minimo}</div>
        <Field label="Quantidade"><input className="input" type="number" min={1} max={tipo === 'Saída' ? peca.quantidade : undefined} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: Number(e.target.value) })} required /></Field>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} required /></Field>
        {tipo === 'Entrada' ? (
          <>
            <Field label="Custo unitário (R$)"><input className="input" inputMode="decimal" defaultValue={String(peca.custoUnit).replace('.', ',')} onChange={(e) => setF({ ...f, custoUnit: toNumber(e.target.value) })} /></Field>
            <div className="field"><label>Total</label><div style={{ paddingTop: 8 }} className="strong">{money(f.quantidade * (f.custoUnit ?? 0))}</div></div>
            <label className="check full"><input type="checkbox" checked={lancar} onChange={(e) => setLancar(e.target.checked)} /> Lançar como despesa paga no financeiro</label>
          </>
        ) : (
          <Field label="Ordem de serviço" full hint="Vincular a saída à OS permite saber o custo real de cada serviço.">
            <select className="select" value={f.osId ?? ''} onChange={(e) => setF({ ...f, osId: e.target.value || undefined })}>
              <option value="">Sem OS (uso interno)</option>
              {ordens.map((o) => <option key={o.id} value={o.id}>{o.numero} · {nome(o.clienteId)} · {o.servico}</option>)}
            </select>
          </Field>
        )}
        <Field label="Observação" full><input className="input" value={f.obs ?? ''} onChange={(e) => setF({ ...f, obs: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
