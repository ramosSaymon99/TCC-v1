import { useMemo, useState } from 'react';
import { HardDrive, Laptop, Monitor, Pencil, Plus, Printer, Router, Server, Trash2, X } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import type { Equipamento } from '../types';
import { Badge, Confirm, Empty, Modal, PageHeader, Pager, SearchInput, Th, useSortPage } from '../components/ui';
import { ClienteSelect, Field, Options } from '../components/fields';
import { addDays, date, diffDays, money, normalize, today, uid } from '../utils/format';

const TIPOS: Equipamento['tipo'][] = ['Notebook', 'Computador', 'Impressora', 'Servidor', 'Rede', 'Outro'];
const ICONES: Record<Equipamento['tipo'], typeof Laptop> = { Notebook: Laptop, Computador: Monitor, Impressora: Printer, Servidor: Server, Rede: Router, Outro: HardDrive };

type Row = Equipamento & { cliente: string; fimGarantia: string; qtdOS: number };

export default function Equipamentos() {
  const { db, upsert, remove, toast } = useStore();
  const nome = useClienteNome();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<Equipamento | null>(null);
  const [deleting, setDeleting] = useState<Equipamento | null>(null);
  const hoje = today();

  const rows: Row[] = useMemo(() => db.equipamentos.map((e) => {
    const [y, m, d] = e.dataAquisicao.split('-').map(Number);
    const fim = new Date(y, m - 1 + e.garantiaMeses, d);
    return {
      ...e, cliente: nome(e.clienteId),
      fimGarantia: `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`,
      qtdOS: db.ordens.filter((o) => o.equipamentoId === e.id).length,
    };
  }), [db.equipamentos, db.ordens, nome]);

  const filtered = rows.filter((e) =>
    (!q || normalize(`${e.nome} ${e.marca} ${e.cliente} ${e.numeroSerie}`).includes(normalize(q))) &&
    (!tipo || e.tipo === tipo) && (!status || e.status === status));
  const s = useSortPage<Row>(filtered, 8);
  const eq = rows.find((e) => e.id === sel) ?? null;
  const garantiaVencendo = rows.filter((e) => e.fimGarantia >= hoje && e.fimGarantia <= addDays(hoje, 60) && e.status !== 'Inativo');

  return (
    <>
      <PageHeader title="Equipamentos" subtitle="Cadastre e controle os equipamentos dos seus clientes.">
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), nome: '', marca: '', tipo: 'Notebook', numeroSerie: '', clienteId: '', status: 'Em uso', dataAquisicao: hoje, garantiaMeses: 12 })}>
          <Plus size={16} /> Novo equipamento
        </button>
      </PageHeader>

      {garantiaVencendo.length > 0 && (
        <div className="insight opp" style={{ marginBottom: 16 }}>
          <div className="d">
            <strong>{garantiaVencendo.length} equipamento(s) com garantia terminando nos próximos 60 dias</strong> ({garantiaVencendo.map((e) => `${e.nome} – ${e.cliente}`).join('; ')}).
            Oportunidade de oferecer manutenção preventiva ou contrato de suporte.
          </div>
        </div>
      )}

      <div className={eq ? 'drawer-layout' : ''}>
        <div className="card">
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por marca, modelo, cliente ou nº de série..." />
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos os tipos</option><Options items={TIPOS} />
            </select>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option><Options items={['Em uso', 'Em manutenção', 'Inativo'] as const} />
            </select>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <Th label="Equipamento" k="nome" s={s} />
                  <Th label="Cliente" k="cliente" s={s} />
                  {!eq && <Th label="Tipo" k="tipo" s={s} />}
                  <Th label="Garantia até" k="fimGarantia" s={s} className="hide-sm" />
                  <Th label="Status" k="status" s={s} />
                  <th className="right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {s.view.map((e) => {
                  const Icon = ICONES[e.tipo];
                  return (
                    <tr key={e.id} className={`clickable ${sel === e.id ? 'selected' : ''}`} onClick={() => setSel(e.id)}>
                      <td><div className="row"><Icon size={16} color="var(--muted)" /><div><div className="strong">{e.nome}</div><div className="sub">{e.marca} · {e.numeroSerie}</div></div></div></td>
                      <td>{e.cliente}</td>
                      {!eq && <td>{e.tipo}</td>}
                      <td className={`hide-sm ${e.fimGarantia < hoje ? 'muted' : ''}`}>{date(e.fimGarantia)}{e.fimGarantia < hoje && <div className="sub">expirada</div>}</td>
                      <td><Badge>{e.status}</Badge></td>
                      <td className="right nowrap" onClick={(ev) => ev.stopPropagation()}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => setEditing(e)}><Pencil size={15} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" onClick={() => setDeleting(e)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {s.total === 0 && <Empty text="Nenhum equipamento encontrado." />}
          </div>
          <Pager {...s} noun="equipamentos" />
        </div>

        {eq && (() => {
          const Icon = ICONES[eq.tipo];
          const hist = db.ordens.filter((o) => o.equipamentoId === eq.id).sort((a, b) => b.abertura.localeCompare(a.abertura));
          const emGarantia = eq.fimGarantia >= hoje;
          return (
            <aside className="card side-panel">
              <div className="panel-head">
                <h3 style={{ fontSize: 15 }}>{eq.nome}</h3>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSel(null)} aria-label="Fechar"><X size={16} /></button>
              </div>
              <div className="panel-body">
                <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <div className="kpi-icon tone-blue" style={{ width: 72, height: 72, borderRadius: 14 }}><Icon size={36} /></div>
                  <dl className="dl" style={{ flex: 1 }}>
                    <div><dt>Cliente</dt><dd>{eq.cliente}</dd></div>
                    <div><dt>Tipo / Marca</dt><dd>{eq.tipo} · {eq.marca}</dd></div>
                  </dl>
                </div>
                <div className="divider" />
                <dl className="dl" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div><dt>Status</dt><dd><Badge>{eq.status}</Badge></dd></div>
                  <div><dt>Nº de série</dt><dd>{eq.numeroSerie}</dd></div>
                  <div><dt>Data de aquisição</dt><dd>{date(eq.dataAquisicao)}</dd></div>
                  <div><dt>Garantia</dt><dd>{eq.garantiaMeses} meses</dd></div>
                  <div style={{ gridColumn: '1/-1' }}><dt>Situação da garantia</dt>
                    <dd className={emGarantia ? 'text-success' : 'muted'}>{emGarantia ? `Vigente — ${diffDays(eq.fimGarantia, hoje)} dias restantes` : `Expirada em ${date(eq.fimGarantia)}`}</dd>
                  </div>
                </dl>
                <div className="divider" />
                <div className="strong small" style={{ marginBottom: 6 }}>Histórico de serviços ({hist.length})</div>
                {hist.length ? hist.map((o) => (
                  <div key={o.id} className="row between small" style={{ padding: '6px 0' }}>
                    <span>{o.numero} · {o.servico}<br /><span className="muted">{date(o.abertura)} · {money(o.valor)}</span></span><Badge>{o.status}</Badge>
                  </div>
                )) : <div className="small muted">Nenhuma OS vinculada.</div>}
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setEditing(eq)}><Pencil size={15} /> Editar</button>
                </div>
              </div>
            </aside>
          );
        })()}
      </div>

      {editing && <EquipForm e={editing} onClose={() => setEditing(null)} onSave={(e) => {
        if (!e.nome || !e.clienteId) return toast('Preencha equipamento e cliente.', 'error');
        upsert('equipamentos', e); toast('Equipamento salvo.'); setEditing(null);
      }} />}
      {deleting && <Confirm text={<>Excluir <strong>{deleting.nome}</strong>?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('equipamentos', deleting.id); if (sel === deleting.id) setSel(null); toast('Equipamento excluído.'); }} />}
    </>
  );
}

function EquipForm({ e, onClose, onSave }: { e: Equipamento; onClose: () => void; onSave: (e: Equipamento) => void }) {
  const [f, setF] = useState(e);
  const set = <K extends keyof Equipamento>(k: K, v: Equipamento[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={e.nome ? 'Editar equipamento' : 'Novo equipamento'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="eq-form">Salvar</button>
    </>}>
      <form id="eq-form" className="form-grid" onSubmit={(ev) => { ev.preventDefault(); onSave(f); }}>
        <Field label="Equipamento / modelo" full><input className="input" value={f.nome} onChange={(ev) => set('nome', ev.target.value)} required /></Field>
        <Field label="Marca"><input className="input" value={f.marca} onChange={(ev) => set('marca', ev.target.value)} /></Field>
        <Field label="Tipo"><select className="select" value={f.tipo} onChange={(ev) => set('tipo', ev.target.value as Equipamento['tipo'])}><Options items={TIPOS} /></select></Field>
        <Field label="Cliente" full><ClienteSelect value={f.clienteId} onChange={(v) => set('clienteId', v)} /></Field>
        <Field label="Nº de série"><input className="input" value={f.numeroSerie} onChange={(ev) => set('numeroSerie', ev.target.value)} /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(ev) => set('status', ev.target.value as Equipamento['status'])}><Options items={['Em uso', 'Em manutenção', 'Inativo'] as const} /></select></Field>
        <Field label="Data de aquisição"><input className="input" type="date" value={f.dataAquisicao} onChange={(ev) => set('dataAquisicao', ev.target.value)} /></Field>
        <Field label="Garantia (meses)"><input className="input" type="number" min={0} value={f.garantiaMeses} onChange={(ev) => set('garantiaMeses', Number(ev.target.value))} /></Field>
        <Field label="Observações" full><textarea className="textarea" value={f.observacoes ?? ''} onChange={(ev) => set('observacoes', ev.target.value)} /></Field>
      </form>
    </Modal>
  );
}
