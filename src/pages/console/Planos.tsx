import { useMemo, useState } from 'react';
import { Calculator, Check, Lock, Pencil, Plus, Settings2, Star, Trash2 } from 'lucide-react';
import { usePlataforma } from '../../store/PlataformaStore';
import { useStore } from '../../store/Store';
import type { ConfigPlataforma, Modulo, Plano } from '../../types';
import { Badge, Confirm, Modal, PageHeader } from '../../components/ui';
import { Field, toNumber } from '../../components/fields';
import { money, pct, uid } from '../../utils/format';
import { linhas } from '../../utils/saas';
import { cfgDe, ESSENCIAIS, modulosLiberados, MODULOS_DADOS, PAGANTE, planoDe } from '../../store/plataforma';
import { MODULOS } from '../../store/seed';

export default function ConsolePlanos() {
  const { dados, uso, salvar, excluir } = usePlataforma();
  const { toast } = useStore();
  const [editando, setEditando] = useState<Plano | null>(null);
  const [excluindo, setExcluindo] = useState<Plano | null>(null);
  const [cfgAberta, setCfgAberta] = useState(false);
  const ls = useMemo(() => linhas(dados, uso), [dados, uso]);
  const planos = [...dados.planos].sort((a, b) => a.ordem - b.ordem);
  const pagantes = ls.filter((a) => PAGANTE.includes(a.status));
  const mrrTotal = pagantes.reduce((s, a) => s + a.mrr, 0);
  const cfg = cfgDe(dados);

  // Adoção real de cada módulo entre as empresas que têm acesso a ele (embasa o empacotamento dos planos)
  const adocao = (m: Modulo) => {
    const com = pagantes.filter((a) => modulosLiberados(a, planoDe(dados, a.planoId)).includes(m));
    return { n: com.length, usam: com.filter((a) => a.usoT.modulosEmUso.includes(m)).length };
  };
  const avulsos = (m: Modulo) => pagantes.filter((a) => a.modulosExtras.includes(m)).length;

  return (
    <>
      <PageHeader title="Planos e preços" subtitle="O que cada plano libera, quanto custa e como a carteira se distribui. Mudanças valem na hora para todas as empresas do plano.">
        <button className="btn" onClick={() => setCfgAberta(true)}><Settings2 size={16} /> Regras comerciais</button>
        <button className="btn btn-primary" onClick={() => setEditando({ id: uid(), nome: '', descricao: '', precoMensal: 0, descontoAnual: 0.15, maxUsuarios: 3, precoUsuarioExtra: 25, modulos: [...ESSENCIAIS], ativo: true, ordem: planos.length + 1 })}>
          <Plus size={16} /> Novo plano
        </button>
      </PageHeader>

      <div className="grid g-3">
        {planos.map((p) => {
          const xs = pagantes.filter((a) => a.planoId === p.id);
          const mrr = xs.reduce((s, a) => s + a.mrr, 0);
          return (
            <div key={p.id} className="card card-pad" style={{ borderColor: p.destaque ? 'var(--primary)' : undefined, borderWidth: p.destaque ? 2 : 1, opacity: p.ativo ? 1 : 0.6 }}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{p.nome}</h3>
                <span className="row" style={{ gap: 6 }}>
                  {p.destaque && <Badge tone="blue"><Star size={10} /> Recomendado</Badge>}
                  {!p.ativo && <Badge tone="gray">Inativo</Badge>}
                </span>
              </div>
              <p className="small muted" style={{ minHeight: 34 }}>{p.descricao}</p>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{money(p.precoMensal)}<span className="small muted" style={{ fontWeight: 500 }}>/mês</span></div>
              <div className="small muted">ou {money(p.precoMensal * (1 - p.descontoAnual))}/mês no anual (−{pct(p.descontoAnual)})</div>
              <div className="small" style={{ margin: '10px 0' }}><strong>{p.maxUsuarios} usuário(s)</strong> · extra {money(p.precoUsuarioExtra)}/mês</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 4 }}>
                {MODULOS.map((m) => {
                  const ok = p.modulos.includes(m.id) || ESSENCIAIS.includes(m.id);
                  return (
                    <li key={m.id} className="small row" style={{ gap: 6, color: ok ? undefined : 'var(--muted)' }}>
                      {ok ? <Check size={14} color="var(--success)" /> : <Lock size={13} />}{m.label}
                    </li>
                  );
                })}
              </ul>
              <div className="divider" />
              <div className="row between small" style={{ marginTop: 10 }}><span>Assinantes pagantes</span><strong>{xs.length}</strong></div>
              <div className="row between small"><span>MRR do plano</span><strong>{money(mrr)} ({pct(mrrTotal ? mrr / mrrTotal : 0)})</strong></div>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setEditando(p)}><Pencil size={14} /> Editar</button>
                <button className="btn btn-sm btn-ghost" onClick={() => {
                  if (dados.assinantes.some((a) => a.planoId === p.id)) return toast('Há empresas neste plano. Mude-as de plano ou desative-o.', 'error');
                  setExcluindo(p);
                }}><Trash2 size={14} /> Excluir</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Matriz de módulos × adoção real</h3>
              <div className="card-sub">Quem tem acesso usa? Módulo pouco usado num plano é custo de suporte sem valor percebido; módulo muito comprado avulso é candidato a entrar no plano.</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Módulo</th>{planos.map((p) => <th key={p.id} className="right">{p.nome}</th>)}<th className="num">Adoção</th><th className="num hide-sm">Avulsos</th></tr></thead>
              <tbody>
                {MODULOS.map((m) => {
                  const a = adocao(m.id);
                  const taxa = a.n ? a.usam / a.n : null;
                  const medido = MODULOS_DADOS.includes(m.id);
                  return (
                    <tr key={m.id}>
                      <td className="strong">{m.label}{ESSENCIAIS.includes(m.id) && <span className="sub"> · essencial</span>}</td>
                      {planos.map((p) => <td key={p.id} className="right">{p.modulos.includes(m.id) || ESSENCIAIS.includes(m.id) ? <Check size={15} color="var(--success)" /> : <span className="muted">—</span>}</td>)}
                      <td className={`num ${taxa !== null && medido && taxa < 0.4 ? 'text-danger strong' : ''}`}>{medido && taxa !== null ? `${pct(taxa)} (${a.usam}/${a.n})` : '—'}</td>
                      <td className="num hide-sm">{avulsos(m.id) || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <Simulador planos={planos} />
      </div>

      {editando && <EditarPlano p={editando} onClose={() => setEditando(null)} onSave={(p) => {
        if (!p.nome.trim() || p.precoMensal <= 0) return toast('Informe nome e preço do plano.', 'error');
        if (p.destaque) for (const o of dados.planos) if (o.id !== p.id && o.destaque) salvar('planos', { ...o, destaque: false });
        salvar('planos', { ...p, modulos: [...new Set([...ESSENCIAIS, ...p.modulos])] });
        toast(`Plano ${p.nome} salvo. As empresas do plano já veem a mudança no próximo acesso.`);
        setEditando(null);
      }} />}
      {excluindo && <Confirm text={<>Excluir o plano <strong>{excluindo.nome}</strong>?</>} onClose={() => setExcluindo(null)} onConfirm={() => { excluir('planos', excluindo.id); toast('Plano excluído.'); }} />}
      {cfgAberta && <RegrasComerciais cfg={cfg} onClose={() => setCfgAberta(false)} onSave={(c) => { salvar('config', c); toast('Regras comerciais salvas.'); setCfgAberta(false); }} />}
    </>
  );
}

/** Simula reajuste de preço considerando a perda esperada de assinantes. */
function Simulador({ planos }: { planos: Plano[] }) {
  const { dados, uso } = usePlataforma();
  const [planoId, setPlanoId] = useState(planos[0]?.id ?? '');
  const [reajuste, setReajuste] = useState(10);
  const [perda, setPerda] = useState(3);
  const xs = linhas(dados, uso).filter((a) => a.planoId === planoId && PAGANTE.includes(a.status));
  const atual = xs.reduce((s, a) => s + a.mrr, 0);
  const novo = atual * (1 + reajuste / 100) * (1 - perda / 100);
  const delta = novo - atual;
  const equilibrio = reajuste > 0 ? reajuste / (100 + reajuste) : 0; // perda que zera o ganho
  return (
    <div className="card">
      <div className="card-head"><div><h3 className="row"><Calculator size={16} color="var(--primary)" /> Simulador de reajuste</h3><div className="card-sub">Quanto o reajuste rende se parte da base cancelar?</div></div></div>
      <div className="card-pad" style={{ display: 'grid', gap: 12 }}>
        <Field label="Plano"><select className="select" value={planoId} onChange={(e) => setPlanoId(e.target.value)}>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="Reajuste (%)"><input className="input" type="number" value={reajuste} onChange={(e) => setReajuste(Number(e.target.value))} /></Field>
          <Field label="Perda esperada de assinantes (%)"><input className="input" type="number" min={0} max={100} value={perda} onChange={(e) => setPerda(Number(e.target.value))} /></Field>
        </div>
        <div className="row between small"><span>MRR atual do plano ({xs.length} pagantes)</span><strong>{money(atual)}</strong></div>
        <div className="row between small"><span>MRR projetado</span><strong>{money(novo)}</strong></div>
        <div className="row between"><strong>Impacto</strong><strong className={delta >= 0 ? 'text-success' : 'text-danger'}>{delta >= 0 ? '+' : '−'}{money(Math.abs(delta))}/mês · {delta >= 0 ? '+' : '−'}{money(Math.abs(delta * 12))}/ano</strong></div>
        <div className={`insight ${delta >= 0 ? 'good' : 'risk'}`} style={{ padding: 10 }}>
          <div className="d">
            {reajuste > 0
              ? <>O reajuste de {reajuste}% só deixa de compensar se mais de <strong>{pct(equilibrio, 1)}</strong> dos assinantes do plano cancelarem por causa dele. Aplique primeiro às contas novas e às que estão na fidelidade anual, que têm menor risco.</>
              : 'Informe um reajuste positivo para ver o ponto de equilíbrio.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditarPlano({ p, onClose, onSave }: { p: Plano; onClose: () => void; onSave: (p: Plano) => void }) {
  const { dados } = usePlataforma();
  const [f, setF] = useState(p);
  const set = <K extends keyof Plano>(k: K, v: Plano[K]) => setF((x) => ({ ...x, [k]: v }));
  const afetados = dados.assinantes.filter((a) => a.planoId === p.id && a.status !== 'Cancelada');
  const removidos = p.modulos.filter((m) => !f.modulos.includes(m));
  return (
    <Modal wide title={p.nome ? `Editar plano ${p.nome}` : 'Novo plano'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="pl-form">Salvar plano</button>
    </>}>
      <form id="pl-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Nome"><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required /></Field>
        <Field label="Ordem (1 = entrada)"><input className="input" type="number" min={1} value={f.ordem} onChange={(e) => set('ordem', Number(e.target.value))} /></Field>
        <Field label="Descrição (o que o cliente ganha)" full><input className="input" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <Field label="Preço mensal (R$)"><input className="input" inputMode="decimal" defaultValue={f.precoMensal ? String(f.precoMensal).replace('.', ',') : ''} onChange={(e) => set('precoMensal', toNumber(e.target.value))} required /></Field>
        <Field label="Desconto da fidelidade anual (%)"><input className="input" type="number" min={0} max={60} value={Math.round(f.descontoAnual * 100)} onChange={(e) => set('descontoAnual', Number(e.target.value) / 100)} /></Field>
        <Field label="Usuários incluídos"><input className="input" type="number" min={1} value={f.maxUsuarios} onChange={(e) => set('maxUsuarios', Math.max(1, Number(e.target.value)))} /></Field>
        <Field label="Preço do usuário extra (R$/mês)"><input className="input" inputMode="decimal" defaultValue={String(f.precoUsuarioExtra).replace('.', ',')} onChange={(e) => set('precoUsuarioExtra', toNumber(e.target.value))} /></Field>
        <Field label="Situação">
          <div className="row" style={{ gap: 16 }}>
            <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Disponível para venda</label>
            <label className="check"><input type="checkbox" checked={!!f.destaque} onChange={(e) => set('destaque', e.target.checked)} /> Recomendado</label>
          </div>
        </Field>
        <Field label="Módulos liberados" full hint="Início, Usuários e Configurações fazem parte de todos os planos">
          <div className="perm-grid">
            {MODULOS.map((m) => {
              const ess = ESSENCIAIS.includes(m.id);
              return (
                <label key={m.id} className="check">
                  <input type="checkbox" disabled={ess} checked={ess || f.modulos.includes(m.id)}
                    onChange={(e) => set('modulos', e.target.checked ? [...f.modulos, m.id] : f.modulos.filter((x) => x !== m.id))} />
                  {m.label}
                </label>
              );
            })}
          </div>
        </Field>
        {removidos.length > 0 && afetados.length > 0 && (
          <div className="insight warn" style={{ gridColumn: '1 / -1' }}>
            <div className="d"><strong>{afetados.length} empresa(s)</strong> deste plano perdem o acesso a {removidos.map((m) => MODULOS.find((x) => x.id === m)?.label).join(', ')}. Os dados delas ficam guardados. Considere manter o módulo para quem já tem (como avulso) para evitar insatisfação.</div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function RegrasComerciais({ cfg, onClose, onSave }: { cfg: ConfigPlataforma; onClose: () => void; onSave: (c: ConfigPlataforma) => void }) {
  const [f, setF] = useState(cfg);
  const set = <K extends keyof ConfigPlataforma>(k: K, v: ConfigPlataforma[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title="Regras comerciais" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={() => onSave(f)}>Salvar</button>
    </>}>
      <div className="form-grid">
        <Field label="Preço do módulo avulso (R$/mês)"><input className="input" inputMode="decimal" defaultValue={String(f.precoModuloAvulso).replace('.', ',')} onChange={(e) => set('precoModuloAvulso', toNumber(e.target.value))} /></Field>
        <Field label="Dias de teste grátis"><input className="input" type="number" min={0} value={f.diasTrial} onChange={(e) => set('diasTrial', Number(e.target.value))} /></Field>
        <Field label="Tolerância de atraso (dias)" hint="Acima disso a conta entra em risco e aparece para suspensão"><input className="input" type="number" min={0} value={f.diasTolerancia} onChange={(e) => set('diasTolerancia', Number(e.target.value))} /></Field>
        <Field label="Investimento em aquisição (R$/mês)" hint="Marketing, anúncios e comissões — base do CAC"><input className="input" inputMode="decimal" defaultValue={String(f.investimentoAquisicaoMes).replace('.', ',')} onChange={(e) => set('investimentoAquisicaoMes', toNumber(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}
