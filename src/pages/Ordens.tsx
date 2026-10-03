import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Gauge, Plus, Printer, Smile, Timer, Wrench, X } from 'lucide-react';
import { imprimirOS } from '../utils/print';
import { useClienteNome, useStore } from '../store/Store';
import type { CategoriaServico, OrdemServico, StatusOS } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../components/ui';
import { ClienteSelect, Field, Options, toNumber } from '../components/fields';
import { addDays, date, diffDays, downloadCSV, lastMonths, money, monthKey, monthLabel, normalize, pct, today, uid } from '../utils/format';
import { ABERTAS } from '../utils/metrics';
import { CATEGORIAS } from '../store/seed';

type Row = OrdemServico & { cliente: string; atrasada: boolean };
const STATUS: StatusOS[] = ['Aberta', 'Em andamento', 'Aguardando peças', 'Finalizada', 'Cancelada'];

export default function Ordens() {
  const { db, upsert, remove, toast } = useStore();
  const nome = useClienteNome();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mes, setMes] = useState('');
  const [editing, setEditing] = useState<OrdemServico | null>(() => db.ordens.find((o) => o.id === params.get('id')) ?? null);
  const [deleting, setDeleting] = useState<OrdemServico | null>(null);
  const filtro = params.get('filtro');
  const hoje = today();

  const rows: Row[] = useMemo(() => db.ordens.map((o) => ({
    ...o, cliente: nome(o.clienteId), atrasada: (ABERTAS as readonly string[]).includes(o.status) && o.prazo < hoje,
  })), [db.ordens, nome, hoje]);

  const filtered = rows.filter((o) =>
    (!q || normalize(`${o.numero} ${o.cliente} ${o.servico}`).includes(normalize(q))) &&
    (!status || o.status === status) && (!mes || monthKey(o.abertura) === mes) && (filtro !== 'atrasadas' || o.atrasada));
  const s = useSortPage<Row>(filtered, 8, { key: 'numero', dir: 'desc' });

  // Indicadores operacionais
  const abertas = rows.filter((o) => (ABERTAS as readonly string[]).includes(o.status));
  const atrasadas = rows.filter((o) => o.atrasada);
  const finalizadas = rows.filter((o) => o.status === 'Finalizada' && o.conclusao);
  // NPS = % promotores (9–10) − % detratores (0–6) entre as OS avaliadas
  const avaliadas = rows.filter((o) => o.avaliacao !== undefined);
  const nps = avaliadas.length ? Math.round(((avaliadas.filter((o) => o.avaliacao! >= 9).length - avaliadas.filter((o) => o.avaliacao! <= 6).length) / avaliadas.length) * 100) : null;
  const semAvaliacao = finalizadas.filter((o) => o.avaliacao === undefined).length;
  const noPrazo = finalizadas.filter((o) => o.conclusao! <= o.prazo);
  const tempoMedio = finalizadas.length ? finalizadas.reduce((a, o) => a + diffDays(o.conclusao!, o.abertura), 0) / finalizadas.length : 0;
  const aguardando = rows.filter((o) => o.status === 'Aguardando peças');

  const mudarStatus = (o: OrdemServico, st: StatusOS) => {
    const upd: OrdemServico = { ...o, status: st, conclusao: st === 'Finalizada' ? hoje : undefined };
    upsert('ordens', upd);
    if (st === 'Finalizada' && !db.lancamentos.some((l) => l.osId === o.id)) {
      upsert('lancamentos', { id: uid(), tipo: 'Receita', descricao: o.servico, categoria: o.categoria, valor: o.valor, data: hoje, status: 'Pendente', clienteId: o.clienteId, osId: o.id });
      toast(`${o.numero} finalizada. Receita de ${money(o.valor)} lançada como pendente no financeiro.`);
    } else toast(`${o.numero}: ${st}.`);
  };

  const novo = (): OrdemServico => {
    const n = db.ordens.reduce((m, x) => Math.max(m, Number(x.numero.replace(/\D/g, '')) || 0), 0) + 1;
    return { id: uid(), numero: `OS-${String(n).padStart(3, '0')}`, clienteId: '', servico: '', categoria: 'Manutenção', abertura: hoje, prazo: addDays(hoje, 5), status: 'Aberta', valor: 0 };
  };

  return (
    <>
      <PageHeader title="Ordens de Serviço" subtitle="Gerencie os serviços em andamento e finalizados.">
        <button className="btn" onClick={() => downloadCSV('ordens-servico.csv', [
          ['Nº', 'Cliente', 'Serviço', 'Abertura', 'Prazo', 'Conclusão', 'Status', 'Valor'],
          ...filtered.map((o) => [o.numero, o.cliente, o.servico, date(o.abertura), date(o.prazo), date(o.conclusao), o.status, o.valor.toFixed(2).replace('.', ',')]),
        ])}><Download size={16} /> Exportar</button>
        <button className="btn btn-primary" onClick={() => setEditing(novo())}><Plus size={16} /> Nova OS</button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <Kpi icon={<Wrench size={20} />} tone="blue" label="OS em aberto" value={abertas.length} foot={`${money(abertas.reduce((a, o) => a + o.valor, 0))} a faturar`} />
        <Kpi icon={<AlertTriangle size={20} />} tone="red" label="Com prazo vencido" value={atrasadas.length}
          foot={atrasadas.length ? <button className="btn btn-sm btn-ghost" style={{ padding: 0, height: 'auto', color: 'var(--danger)' }} onClick={() => setParams({ filtro: 'atrasadas' })}>Ver atrasadas →</button> : 'Nenhuma atrasada'} />
        <Kpi icon={<CheckCircle2 size={20} />} tone="green" label="Entregas no prazo (SLA)" value={pct(finalizadas.length ? noPrazo.length / finalizadas.length : 0)} foot={`${noPrazo.length} de ${finalizadas.length} finalizadas`} />
        <Kpi icon={<Timer size={20} />} tone="orange" label="Tempo médio de execução" value={`${tempoMedio.toFixed(1).replace('.', ',')} dias`}
          foot={aguardando.length ? <span className="row" style={{ gap: 4 }}><Gauge size={13} /> {aguardando.length} aguardando peças</span> : 'Abertura → conclusão'} />
        <Kpi icon={<Smile size={20} />} tone="purple" label="Satisfação (NPS)" value={nps === null ? '—' : nps}
          foot={`${avaliadas.length} avaliação(ões)${semAvaliacao ? ` · ${semAvaliacao} OS sem nota` : ''}`} />
      </div>

      <div className="card">
        <div className="toolbar">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option><Options items={STATUS} />
          </select>
          <select className="select" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {lastMonths(6).reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente, serviço ou número..." />
          {filtro === 'atrasadas' && <button className="btn btn-sm btn-outline-primary" onClick={() => setParams({})}>Somente atrasadas <X size={14} /></button>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Nº" k="numero" s={s} />
                <Th label="Cliente" k="cliente" s={s} />
                <Th label="Serviço" k="servico" s={s} />
                <Th label="Abertura" k="abertura" s={s} className="hide-sm" />
                <Th label="Prazo" k="prazo" s={s} />
                <Th label="Valor" k="valor" s={s} className="num" />
                <Th label="Status" k="status" s={s} />
                <th className="right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.view.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setEditing(o)}>
                  <td className="strong">{o.numero}</td>
                  <td>{o.cliente}</td>
                  <td>{o.servico}{o.tecnico && <div className="sub">Téc.: {o.tecnico}</div>}</td>
                  <td className="hide-sm">{date(o.abertura)}</td>
                  <td className={`nowrap ${o.atrasada ? 'text-danger strong' : ''}`}>
                    {date(o.prazo)}{o.atrasada && <div className="sub text-danger">{diffDays(hoje, o.prazo)} dia(s) de atraso</div>}
                  </td>
                  <td className="num">{money(o.valor)}</td>
                  <td><Badge>{o.status}</Badge></td>
                  <td className="right">
                    <RowMenu actions={[
                      { label: 'Abrir / editar', onClick: () => setEditing(o) },
                      { label: <><Printer size={14} /> Imprimir OS / termo</>, onClick: () => imprimirOS(o, db.clientes.find((c) => c.id === o.clienteId), db.empresa,
                        db.equipamentos.find((e) => e.id === o.equipamentoId)?.nome,
                        db.movimentos.filter((m) => m.osId === o.id && m.tipo === 'Saída').map((m) => ({ nome: db.pecas.find((p) => p.id === m.pecaId)?.nome ?? 'Peça', qtd: m.quantidade }))) },
                      ...STATUS.filter((st) => st !== o.status).map((st) => ({ label: `Mudar para: ${st}`, onClick: () => mudarStatus(o, st) })),
                      { label: 'Excluir', danger: true, onClick: () => setDeleting(o) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhuma ordem de serviço encontrada." />}
        </div>
        <Pager {...s} noun="ordens de serviço" />
      </div>

      {editing && <OSForm o={editing} onClose={() => { setEditing(null); if (params.get('id')) setParams({}); }} onSave={(o) => {
        if (!o.clienteId || !o.servico) return toast('Preencha cliente e serviço.', 'error');
        const antes = db.ordens.find((x) => x.id === o.id);
        if (antes && antes.status !== o.status) { mudarStatus({ ...o, status: antes.status }, o.status); upsert('ordens', { ...o, conclusao: o.status === 'Finalizada' ? (o.conclusao ?? hoje) : undefined }); }
        else { upsert('ordens', o); toast('Ordem de serviço salva.'); }
        setEditing(null);
      }} />}
      {deleting && <Confirm text={<>Excluir a <strong>{deleting.numero}</strong>?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('ordens', deleting.id); toast('OS excluída.'); }} />}
    </>
  );
}

function OSForm({ o, onClose, onSave }: { o: OrdemServico; onClose: () => void; onSave: (o: OrdemServico) => void }) {
  const { db } = useStore();
  const [f, setF] = useState(o);
  const set = <K extends keyof OrdemServico>(k: K, v: OrdemServico[K]) => setF((x) => ({ ...x, [k]: v }));
  const equips = db.equipamentos.filter((e) => e.clienteId === f.clienteId);
  const tecnicos = db.usuarios.filter((u) => u.perfil === 'Técnico' || u.perfil === 'Proprietário').map((u) => u.nome);
  return (
    <Modal title={`${o.servico ? 'Ordem de serviço' : 'Nova ordem de serviço'} · ${o.numero}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="os-form">Salvar</button>
    </>}>
      <form id="os-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Cliente" full><ClienteSelect value={f.clienteId} onChange={(v) => setF((x) => ({ ...x, clienteId: v, equipamentoId: undefined }))} /></Field>
        <Field label="Serviço"><input className="input" value={f.servico} onChange={(e) => set('servico', e.target.value)} required /></Field>
        <Field label="Categoria">
          <select className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value as CategoriaServico)}><Options items={CATEGORIAS} /></select>
        </Field>
        <Field label="Equipamento">
          <select className="select" value={f.equipamentoId ?? ''} onChange={(e) => set('equipamentoId', e.target.value || undefined)}>
            <option value="">{f.clienteId ? (equips.length ? 'Nenhum' : 'Cliente sem equipamentos') : 'Selecione o cliente'}</option>
            {equips.map((e) => <option key={e.id} value={e.id}>{e.nome} ({e.numeroSerie})</option>)}
          </select>
        </Field>
        <Field label="Técnico responsável">
          <select className="select" value={f.tecnico ?? ''} onChange={(e) => set('tecnico', e.target.value || undefined)}>
            <option value="">Não atribuído</option><Options items={tecnicos} />
          </select>
        </Field>
        <Field label="Data de abertura"><input className="input" type="date" value={f.abertura} onChange={(e) => set('abertura', e.target.value)} /></Field>
        <Field label="Prazo"><input className="input" type="date" value={f.prazo} onChange={(e) => set('prazo', e.target.value)} /></Field>
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" defaultValue={f.valor ? String(f.valor).replace('.', ',') : ''} onChange={(e) => set('valor', toNumber(e.target.value))} /></Field>
        <Field label="Status" hint={f.status === 'Finalizada' ? 'Ao finalizar, uma receita pendente é lançada no financeiro.' : undefined}>
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as StatusOS)}><Options items={STATUS} /></select>
        </Field>
        {f.status === 'Finalizada' && (
          <Field label="Avaliação do cliente (0 a 10)" hint="Pergunte: de 0 a 10, quanto recomendaria nosso serviço? Alimenta o NPS.">
            <select className="select" value={f.avaliacao ?? ''} onChange={(e) => set('avaliacao', e.target.value === '' ? undefined : Number(e.target.value))}>
              <option value="">Não avaliado</option>
              {Array.from({ length: 11 }, (_, i) => 10 - i).map((n) => <option key={n} value={n}>{n}{n >= 9 ? ' · promotor' : n <= 6 ? ' · detrator' : ' · neutro'}</option>)}
            </select>
          </Field>
        )}
        <Field label="Descrição do problema / serviço" full><textarea className="textarea" value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
