import { useState } from 'react';
import { AlertCircle, Plus, Target, TrendingUp, Trash2, Wallet, Timer } from 'lucide-react';
import { useStore } from '../store/Store';
import type { EtapaFunil, Oportunidade } from '../types';
import { Confirm, Kpi, Modal, PageHeader } from '../components/ui';
import { ClienteSelect, Field, Options, toNumber } from '../components/fields';
import { diffDays, money, moneyShort, pct, today, uid } from '../utils/format';

const ETAPAS: { k: EtapaFunil; bg: string; fg: string; prob: number }[] = [
  { k: 'Leads', bg: '#1e6fe8', fg: '#fff', prob: 0.1 },
  { k: 'Em contato', bg: '#3f8bf0', fg: '#fff', prob: 0.25 },
  { k: 'Proposta', bg: '#7fb2f6', fg: '#0a2656', prob: 0.5 },
  { k: 'Negociação', bg: '#b9d6fb', fg: '#0a2656', prob: 0.75 },
  { k: 'Fechados', bg: '#bbf0cf', fg: '#14532d', prob: 1 },
];
const PARADO_DIAS = 7;

export default function Funil() {
  const { db, upsert, remove, toast } = useStore();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<EtapaFunil | null>(null);
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [deleting, setDeleting] = useState<Oportunidade | null>(null);
  const hoje = today();

  const por = (e: EtapaFunil) => db.oportunidades.filter((o) => o.etapa === e);
  const abertas = db.oportunidades.filter((o) => o.etapa !== 'Fechados');
  const pipeline = abertas.reduce((a, o) => a + o.valor, 0);
  const previsao = abertas.reduce((a, o) => a + o.valor * (ETAPAS.find((x) => x.k === o.etapa)!.prob), 0);
  const fechados = por('Fechados');
  const parados = abertas.filter((o) => diffDays(hoje, o.atualizadoEm) > PARADO_DIAS);
  const total = db.oportunidades.length;

  const mover = (id: string, etapa: EtapaFunil) => {
    const o = db.oportunidades.find((x) => x.id === id);
    if (!o || o.etapa === etapa) return;
    upsert('oportunidades', { ...o, etapa, atualizadoEm: hoje });
    toast(etapa === 'Fechados' ? `Negócio fechado: ${o.titulo} (${money(o.valor)}). Gere o orçamento/OS.` : `${o.titulo} → ${etapa}`);
  };

  return (
    <>
      <PageHeader title="Funil Comercial" subtitle="Acompanhe o andamento das suas oportunidades. Arraste os cards entre as etapas.">
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), titulo: '', servico: '', valor: 0, etapa: 'Leads', criadoEm: hoje, atualizadoEm: hoje })}>
          <Plus size={16} /> Nova oportunidade
        </button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<Wallet size={20} />} tone="blue" label="Pipeline em aberto" value={money(pipeline)} foot={`${abertas.length} oportunidades ativas`} />
        <Kpi icon={<Target size={20} />} tone="purple" label="Previsão ponderada" value={money(previsao)} foot="Valor × probabilidade da etapa" />
        <Kpi icon={<TrendingUp size={20} />} tone="green" label="Conversão lead → fechado" value={pct(total ? fechados.length / total : 0, 1)} foot={`${fechados.length} fechados · ${money(fechados.reduce((a, o) => a + o.valor, 0))}`} />
        <Kpi icon={<Timer size={20} />} tone="orange" label={`Paradas há +${PARADO_DIAS} dias`} value={parados.length}
          foot={parados.length ? <span className="text-warning strong">{money(parados.reduce((a, o) => a + o.valor, 0))} sem avanço</span> : 'Funil em movimento'} />
      </div>

      <div className="funnel">
        {ETAPAS.map((et, i) => {
          const items = por(et.k);
          const valor = items.reduce((a, o) => a + o.valor, 0);
          const prox = ETAPAS[i + 1];
          const passagem = prox ? db.oportunidades.filter((o) => ETAPAS.findIndex((x) => x.k === o.etapa) > i).length : 0;
          const chegaram = db.oportunidades.filter((o) => ETAPAS.findIndex((x) => x.k === o.etapa) >= i).length;
          return (
            <div key={et.k}>
              <div className="stage-head" style={{ background: et.bg, color: et.fg }}>
                <div className="l">{et.k}</div>
                <div className="n">{items.length}</div>
                <div className="v">{moneyShort(valor)}</div>
              </div>
              {prox && <div className="small muted" style={{ margin: '6px 4px 0' }} title="Percentual das oportunidades que chegaram a esta etapa e avançaram">Avanço p/ próxima: <strong>{pct(chegaram ? passagem / chegaram : 0)}</strong></div>}
              {!prox && <div className="small muted" style={{ margin: '6px 4px 0' }}>Probabilidade: 100%</div>}
              <div className={`stage-col ${over === et.k ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(et.k); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || drag; if (id) mover(id, et.k); setOver(null); setDrag(null); }}>
                {items.map((o) => {
                  const parado = et.k !== 'Fechados' && diffDays(hoje, o.atualizadoEm) > PARADO_DIAS;
                  return (
                    <div key={o.id} className={`deal ${drag === o.id ? 'dragging' : ''}`} draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); setDrag(o.id); }}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => setEditing(o)}>
                      <div className="t">{o.titulo}</div>
                      <div className="s">{o.servico}</div>
                      <div className="row">
                        <strong>{money(o.valor)}</strong>
                        {parado && <span className="stale row" style={{ gap: 3 }}><AlertCircle size={12} />{diffDays(hoje, o.atualizadoEm)}d parado</span>}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="small muted" style={{ textAlign: 'center', padding: 20 }}>Arraste um card para cá</div>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <OportunidadeForm o={editing} onClose={() => setEditing(null)}
          onDelete={db.oportunidades.some((x) => x.id === editing.id) ? () => { setDeleting(editing); setEditing(null); } : undefined}
          onSave={(o) => {
            if (!o.titulo) return toast('Informe o nome do lead/cliente.', 'error');
            upsert('oportunidades', { ...o, atualizadoEm: hoje }); toast('Oportunidade salva.'); setEditing(null);
          }} />
      )}
      {deleting && <Confirm text={<>Remover a oportunidade <strong>{deleting.titulo}</strong> (marcar como perdida)?</>} label="Remover" onClose={() => setDeleting(null)} onConfirm={() => { remove('oportunidades', deleting.id); toast('Oportunidade removida.'); }} />}
    </>
  );
}

function OportunidadeForm({ o, onClose, onSave, onDelete }: { o: Oportunidade; onClose: () => void; onSave: (o: Oportunidade) => void; onDelete?: () => void }) {
  const { db } = useStore();
  const [f, setF] = useState(o);
  const set = <K extends keyof Oportunidade>(k: K, v: Oportunidade[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={o.titulo ? 'Editar oportunidade' : 'Nova oportunidade'} onClose={onClose} footer={<>
      {onDelete && <button className="btn" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={onDelete}><Trash2 size={15} /> Perdida</button>}
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="op-form">Salvar</button>
    </>}>
      <form id="op-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Cliente cadastrado (opcional)" full hint="Se o lead ainda não é cliente, deixe em branco e informe o nome abaixo.">
          <ClienteSelect allowEmpty value={f.clienteId} onChange={(v) => setF((x) => ({ ...x, clienteId: v || undefined, titulo: v ? db.clientes.find((c) => c.id === v)!.nome : x.titulo }))} />
        </Field>
        <Field label="Nome do lead / cliente"><input className="input" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} required /></Field>
        <Field label="Serviço de interesse"><input className="input" value={f.servico} onChange={(e) => set('servico', e.target.value)} /></Field>
        <Field label="Valor estimado (R$)"><input className="input" inputMode="decimal" defaultValue={f.valor ? String(f.valor).replace('.', ',') : ''} onChange={(e) => set('valor', toNumber(e.target.value))} /></Field>
        <Field label="Etapa">
          <select className="select" value={f.etapa} onChange={(e) => set('etapa', e.target.value as EtapaFunil)}><Options items={ETAPAS.map((x) => x.k)} /></select>
        </Field>
      </form>
    </Modal>
  );
}
