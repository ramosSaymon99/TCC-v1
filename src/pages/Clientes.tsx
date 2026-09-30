import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store/Store';
import type { Cliente } from '../types';
import { Avatar, Badge, Confirm, Empty, Modal, PageHeader, Pager, SearchInput, Th, useSortPage } from '../components/ui';
import { Field, Options } from '../components/fields';
import { addDays, date, diffDays, downloadCSV, money, normalize, today, uid } from '../utils/format';

type Row = Cliente & { ultimaCompra: string; receita12m: number; pedidos: number; risco: boolean };

const vazio = (): Cliente => ({
  id: uid(), nome: '', tipo: 'Pessoa Física', documento: '', telefone: '', email: '', endereco: '', cidade: '',
  status: 'Ativo', criadoEm: today(),
});

export default function Clientes() {
  const { db, upsert, remove, toast } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [deleting, setDeleting] = useState<Cliente | null>(null);
  const [tab, setTab] = useState<'dados' | 'historico' | 'servicos' | 'orcamentos'>('dados');
  const filtro = params.get('filtro');
  const selId = params.get('id');
  const hoje = today();

  const rows: Row[] = useMemo(() => {
    const ini = addDays(hoje, -365);
    return db.clientes.map((c) => {
      const rec = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.clienteId === c.id);
      const ultima = rec.reduce((m, l) => (l.data > m ? l.data : m), '');
      const r12 = rec.filter((l) => l.data >= ini).reduce((s, l) => s + l.valor, 0);
      return { ...c, ultimaCompra: ultima, receita12m: r12, pedidos: rec.length, risco: c.status === 'Ativo' && !!ultima && diffDays(hoje, ultima) > 90 };
    });
  }, [db.clientes, db.lancamentos, hoje]);

  const filtered = rows.filter((c) =>
    (!q || normalize(`${c.nome} ${c.email} ${c.telefone} ${c.documento}`).includes(normalize(q))) &&
    (!tipo || c.tipo === tipo) && (!status || c.status === status) && (filtro !== 'risco' || c.risco));
  const s = useSortPage<Row>(filtered, 8, { key: 'receita12m', dir: 'desc' });
  const sel = rows.find((c) => c.id === selId) ?? null;
  const total12 = rows.reduce((a, r) => a + r.receita12m, 0);

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('id', id); else next.delete('id');
    setParams(next, { replace: true });
    setTab('dados');
  };

  const save = (c: Cliente) => {
    if (!c.nome.trim()) return toast('Informe o nome do cliente.', 'error');
    upsert('clientes', c);
    toast(db.clientes.some((x) => x.id === c.id) ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    setEditing(null);
  };

  const exportar = () => downloadCSV('clientes.csv', [
    ['Nome', 'Tipo', 'Documento', 'Telefone', 'E-mail', 'Cidade', 'Status', 'Última compra', 'Receita 12m'],
    ...filtered.map((c) => [c.nome, c.tipo, c.documento, c.telefone, c.email, c.cidade, c.status, date(c.ultimaCompra), c.receita12m.toFixed(2).replace('.', ',')]),
  ]);

  return (
    <>
      <PageHeader title="Clientes" subtitle="Gerencie seus clientes e acompanhe o histórico de atendimentos.">
        <button className="btn" onClick={exportar}><Download size={16} /> Exportar</button>
        <button className="btn btn-primary" onClick={() => setEditing(vazio())}><Plus size={16} /> Novo cliente</button>
      </PageHeader>

      <div className={sel ? 'drawer-layout' : ''}>
        <div className="card">
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, e-mail, telefone ou documento..." />
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos os tipos</option><Options items={['Pessoa Física', 'Pessoa Jurídica'] as const} />
            </select>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option><Options items={['Ativo', 'Inativo'] as const} />
            </select>
            {filtro === 'risco' && (
              <button className="btn btn-sm btn-outline-primary" onClick={() => { params.delete('filtro'); setParams(params); }}>
                Sem compra há +90 dias <X size={14} />
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <Th label="Nome" k="nome" s={s} />
                  {!sel && <Th label="Telefone" k="telefone" s={s} className="hide-sm" />}
                  {!sel && <Th label="E-mail" k="email" s={s} className="hide-sm" />}
                  <Th label="Tipo" k="tipo" s={s} />
                  <Th label="Última compra" k="ultimaCompra" s={s} />
                  <Th label="Receita 12m" k="receita12m" s={s} className="num" />
                  <Th label="Status" k="status" s={s} />
                  <th className="right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {s.view.map((c) => (
                  <tr key={c.id} className={`clickable ${c.id === selId ? 'selected' : ''}`} onClick={() => select(c.id)}>
                    <td className="strong">{c.nome}<div className="sub" style={{ fontWeight: 400 }}>{c.cidade}</div></td>
                    {!sel && <td className="hide-sm nowrap">{c.telefone}</td>}
                    {!sel && <td className="hide-sm">{c.email}</td>}
                    <td className="nowrap">{c.tipo}</td>
                    <td className="nowrap">
                      {date(c.ultimaCompra)}
                      {c.risco && <div className="sub text-warning">há {diffDays(hoje, c.ultimaCompra)} dias</div>}
                    </td>
                    <td className="num">
                      {money(c.receita12m)}
                      <div className="sub">{total12 ? ((c.receita12m / total12) * 100).toFixed(1).replace('.', ',') : 0}% do total</div>
                    </td>
                    <td><Badge>{c.status}</Badge></td>
                    <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => setEditing(c)}><Pencil size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" onClick={() => setDeleting(c)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.total === 0 && <Empty text="Nenhum cliente encontrado com esses filtros." />}
          </div>
          <Pager {...s} noun="clientes" />
        </div>

        {sel && <ClientePanel c={sel} tab={tab} setTab={setTab} onClose={() => select(null)} onEdit={() => setEditing(sel)} />}
      </div>

      {editing && <ClienteForm c={editing} onClose={() => setEditing(null)} onSave={save} />}
      {deleting && (
        <Confirm
          text={<>Excluir <strong>{deleting.nome}</strong>? Orçamentos, OS e lançamentos vinculados permanecem, mas sem o cadastro.</>}
          onClose={() => setDeleting(null)}
          onConfirm={() => { remove('clientes', deleting.id); if (selId === deleting.id) select(null); toast('Cliente excluído.'); }}
        />
      )}
    </>
  );
}

function ClientePanel({ c, tab, setTab, onClose, onEdit }: {
  c: Row; tab: string; setTab: (t: 'dados' | 'historico' | 'servicos' | 'orcamentos') => void; onClose: () => void; onEdit: () => void;
}) {
  const { db } = useStore();
  const hist = db.lancamentos.filter((l) => l.clienteId === c.id && l.tipo === 'Receita').sort((a, b) => b.data.localeCompare(a.data));
  const os = db.ordens.filter((o) => o.clienteId === c.id).sort((a, b) => b.abertura.localeCompare(a.abertura));
  const orc = db.orcamentos.filter((o) => o.clienteId === c.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const total = hist.reduce((s, l) => s + l.valor, 0);
  const cats = [...new Set(hist.map((h) => h.categoria))];
  const naoContratados = ['Treinamento', 'Manutenção', 'Desenvolvimento Web', 'Implantação'].filter((x) => !cats.includes(x));

  return (
    <aside className="card side-panel">
      <div className="panel-head">
        <div className="person">
          <Avatar nome={c.nome} size="lg" />
          <div>
            <div className="name" style={{ fontSize: 15 }}>{c.nome}</div>
            <div className="meta">{c.tipo} · Cliente desde {date(c.criadoEm)}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="grid g-2" style={{ padding: '0 20px 12px', gap: 8 }}>
        <div className="card card-pad" style={{ padding: 10, boxShadow: 'none' }}><div className="small muted">Receita total</div><div className="strong">{money(total)}</div></div>
        <div className="card card-pad" style={{ padding: 10, boxShadow: 'none' }}><div className="small muted">Ticket médio</div><div className="strong">{money(hist.length ? total / hist.length : 0)}</div></div>
      </div>
      <div className="tabs">
        {([['dados', 'Dados'], ['historico', 'Histórico'], ['servicos', 'Serviços'], ['orcamentos', 'Orçamentos']] as const).map(([k, l]) => (
          <button key={k} style={{ padding: '12px 8px' }} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="panel-body" style={{ paddingTop: 16 }}>
        {tab === 'dados' && (
          <>
            <dl className="dl">
              <div><dt>Nome completo</dt><dd>{c.nome}</dd></div>
              <div><dt>{c.tipo === 'Pessoa Física' ? 'CPF' : 'CNPJ'}</dt><dd>{c.documento || '—'}</dd></div>
              <div><dt>Telefone</dt><dd>{c.telefone}</dd></div>
              <div><dt>E-mail</dt><dd>{c.email}</dd></div>
              <div><dt>Endereço</dt><dd>{c.endereco}{c.cidade ? ` - ${c.cidade}` : ''}</dd></div>
              <div><dt>Status</dt><dd><Badge>{c.status}</Badge></dd></div>
            </dl>
            {c.risco && <div className="insight warn" style={{ marginTop: 14 }}><div className="d">Sem compras há {diffDays(today(), c.ultimaCompra)} dias. Considere um contato de reativação.</div></div>}
            {naoContratados.length > 0 && hist.length > 0 && (
              <div className="insight opp" style={{ marginTop: 10 }}>
                <div className="d"><strong>Cross-sell:</strong> ainda não contratou {naoContratados.join(', ')}.</div>
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={onEdit}><Pencil size={15} /> Editar</button>
          </>
        )}
        {tab === 'historico' && (
          hist.length ? <ul className="list" style={{ margin: '0 -20px' }}>
            {hist.slice(0, 12).map((h) => (
              <li key={h.id}><div style={{ flex: 1 }}><div className="title">{h.descricao}</div><div className="desc">{date(h.data)} · {h.categoria}</div></div><span className="strong small">{money(h.valor)}</span></li>
            ))}
          </ul> : <Empty text="Sem histórico de compras." />
        )}
        {tab === 'servicos' && (
          os.length ? <ul className="list" style={{ margin: '0 -20px' }}>
            {os.map((o) => (
              <li key={o.id}><div style={{ flex: 1 }}><div className="title">{o.numero} · {o.servico}</div><div className="desc">Abertura {date(o.abertura)} · {money(o.valor)}</div></div><Badge>{o.status}</Badge></li>
            ))}
          </ul> : <Empty text="Nenhuma ordem de serviço." />
        )}
        {tab === 'orcamentos' && (
          orc.length ? <ul className="list" style={{ margin: '0 -20px' }}>
            {orc.map((o) => (
              <li key={o.id}><div style={{ flex: 1 }}><div className="title">{o.numero} · {o.servico}</div><div className="desc">{date(o.criadoEm)} · {money(o.valor)}</div></div><Badge>{o.status}</Badge></li>
            ))}
          </ul> : <Empty text="Nenhum orçamento." />
        )}
      </div>
    </aside>
  );
}

function ClienteForm({ c, onClose, onSave }: { c: Cliente; onClose: () => void; onSave: (c: Cliente) => void }) {
  const [f, setF] = useState<Cliente>(c);
  const set = <K extends keyof Cliente>(k: K, v: Cliente[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={c.nome ? 'Editar cliente' : 'Novo cliente'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="cliente-form">Salvar</button>
    </>}>
      <form id="cliente-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Nome completo / Razão social" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Field>
        <Field label="Tipo">
          <select className="select" value={f.tipo} onChange={(e) => set('tipo', e.target.value as Cliente['tipo'])}><Options items={['Pessoa Física', 'Pessoa Jurídica'] as const} /></select>
        </Field>
        <Field label={f.tipo === 'Pessoa Física' ? 'CPF' : 'CNPJ'}><input className="input" value={f.documento} onChange={(e) => set('documento', e.target.value)} /></Field>
        <Field label="Telefone"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(27) 99999-9999" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Endereço"><input className="input" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></Field>
        <Field label="Cidade/UF"><input className="input" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Cliente['status'])}><Options items={['Ativo', 'Inativo'] as const} /></select>
        </Field>
        <Field label="Observações" full><textarea className="textarea" value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
