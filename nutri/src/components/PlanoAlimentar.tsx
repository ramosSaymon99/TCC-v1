import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Printer, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useStore } from '../store/Store';
import { NOMES_REFEICAO, ORIENTACOES_PADRAO, sugerirRefeicoes } from '../store/modelo';
import type { Alimento, Paciente, PlanoAlimentar, Refeicao } from '../types';
import { date, today, uid } from '../utils/format';
import { calcularMetas, medidaCaseira, totaisItens, totaisPlano } from '../utils/nutri';
import { imprimirPlano } from '../utils/print';
import { Field, toNumber } from './fields';
import { Confirm, Empty } from './ui';

const f0 = (n: number) => Math.round(n).toLocaleString('pt-BR');
const f1 = (n: number) => n.toFixed(1).replace('.', ',');

function AlimentoSelect({ value, onChange, alimentos }: { value: string; onChange: (id: string) => void; alimentos: Alimento[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, Alimento[]>();
    for (const a of [...alimentos].sort((x, y) => x.nome.localeCompare(y.nome))) m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [alimentos]);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 200 }}>
      {grupos.map(([g, itens]) => <optgroup key={g} label={g}>{itens.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>)}
    </select>
  );
}

/** Barra de meta: verde dentro de ±10%, laranja fora disso. */
function BarraMeta({ label, atual, meta, unidade }: { label: string; atual: number; meta: number; unidade: string }) {
  const r = meta ? atual / meta : 0;
  const ok = r >= 0.9 && r <= 1.1;
  return (
    <div className="bar-target">
      <span className="strong">{label}</span>
      <div className="meter"><span style={{ width: `${Math.min(100, r * 100)}%`, background: ok ? 'var(--primary)' : 'var(--warning)' }} /></div>
      <span className={ok ? '' : 'text-warning'}><b>{f0(atual)}</b> / {f0(meta)} {unidade} ({f0(r * 100)}%)</span>
    </div>
  );
}

export default function PlanoAlimentarTab({ paciente, pesoAtual }: { paciente: Paciente; pesoAtual?: number }) {
  const { db, upsert, remove, toast } = useStore();
  const planos = useMemo(() => db.planos.filter((p) => p.pacienteId === paciente.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), [db.planos, paciente.id]);
  const [selId, setSelId] = useState(planos.find((p) => p.ativo)?.id ?? planos[0]?.id ?? '');
  const salvo = planos.find((p) => p.id === selId);
  const [draft, setDraft] = useState<PlanoAlimentar | null>(salvo ?? null);
  const [excluir, setExcluir] = useState(false);
  useEffect(() => { setDraft(salvo ?? null); }, [selId]);

  const mapa = useMemo(() => new Map(db.alimentos.map((a) => [a.id, a])), [db.alimentos]);
  const peso = pesoAtual ?? 70;
  const metas = calcularMetas(paciente, peso);
  const sujo = !!draft && JSON.stringify(draft) !== JSON.stringify(salvo);

  const novo = () => {
    const p: PlanoAlimentar = {
      id: uid(), pacienteId: paciente.id, nome: `Plano alimentar ${date(today())}`, criadoEm: today(),
      kcalMeta: metas.kcal, protMeta: metas.prot, carbMeta: metas.carb, gordMeta: metas.gord,
      refeicoes: sugerirRefeicoes(metas, db.alimentos), orientacoes: ORIENTACOES_PADRAO, ativo: true,
    };
    planos.filter((x) => x.ativo).forEach((x) => upsert('planos', { ...x, ativo: false }));
    upsert('planos', p);
    setSelId(p.id); setDraft(p);
    toast('Plano criado com sugestão ajustada à meta calórica. Revise os alimentos.');
  };

  if (!draft) {
    return (
      <div style={{ padding: 20 }}>
        <Empty text="Nenhum plano alimentar para este paciente." />
        <div style={{ textAlign: 'center' }}>
          {!pesoAtual && <p className="small text-warning">Sem avaliação registrada: a sugestão usará 70 kg. Registre uma avaliação antes para metas precisas.</p>}
          <button className="btn btn-primary" onClick={novo}><Plus size={16} /> Criar plano com sugestão ({f0(metas.kcal)} kcal)</button>
        </div>
      </div>
    );
  }

  const tot = totaisPlano(draft, mapa);
  const set = (patch: Partial<PlanoAlimentar>) => setDraft({ ...draft, ...patch });
  const setRef = (rid: string, patch: Partial<Refeicao>) => set({ refeicoes: draft.refeicoes.map((r) => (r.id === rid ? { ...r, ...patch } : r)) });
  const kcalMacros = tot.prot * 4 + tot.carb * 4 + tot.gord * 9 || 1;

  const salvar = () => {
    if (draft.ativo) planos.filter((x) => x.ativo && x.id !== draft.id).forEach((x) => upsert('planos', { ...x, ativo: false }));
    upsert('planos', draft);
    toast('Plano alimentar salvo.');
  };

  return (
    <div style={{ padding: 20 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select className="select" style={{ width: 'auto', minWidth: 240 }} value={selId} onChange={(e) => setSelId(e.target.value)}>
          {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.ativo ? ' (ativo)' : ''}</option>)}
        </select>
        <button className="btn" onClick={novo}><Plus size={16} /> Novo</button>
        <button className="btn" onClick={() => { const c = { ...draft, id: uid(), nome: `${draft.nome} (cópia)`, criadoEm: today(), ativo: false, refeicoes: draft.refeicoes.map((r) => ({ ...r, id: uid() })) }; upsert('planos', c); setSelId(c.id); toast('Plano duplicado.'); }}><Copy size={16} /> Duplicar</button>
        <button className="btn" onClick={() => imprimirPlano(draft, paciente, db.config, mapa, peso)}><Printer size={16} /> Imprimir / PDF</button>
        <button className="btn" onClick={() => setExcluir(true)}><Trash2 size={16} /> Excluir</button>
        <div style={{ flex: 1 }} />
        {sujo && <span className="small text-warning">Alterações não salvas</span>}
        <button className="btn btn-primary" onClick={salvar} disabled={!sujo}><Save size={16} /> Salvar</button>
      </div>

      <div className="grid g-2">
        <div className="form-grid" style={{ alignContent: 'start' }}>
          <Field label="Nome do plano" full><input className="input" value={draft.nome} onChange={(e) => set({ nome: e.target.value })} /></Field>
          <Field label="Meta calórica (kcal)" hint={`GET estimado ${f0(metas.get)} kcal · ${paciente.objetivo}`}><input className="input" inputMode="numeric" value={draft.kcalMeta} onChange={(e) => set({ kcalMeta: toNumber(e.target.value) })} /></Field>
          <Field label="Proteína (g)" hint={`${f1(draft.protMeta / peso)} g/kg`}><input className="input" inputMode="numeric" value={draft.protMeta} onChange={(e) => set({ protMeta: toNumber(e.target.value) })} /></Field>
          <Field label="Carboidrato (g)"><input className="input" inputMode="numeric" value={draft.carbMeta} onChange={(e) => set({ carbMeta: toNumber(e.target.value) })} /></Field>
          <Field label="Gordura (g)"><input className="input" inputMode="numeric" value={draft.gordMeta} onChange={(e) => set({ gordMeta: toNumber(e.target.value) })} /></Field>
          <div className="full row">
            <label className="check"><input type="checkbox" checked={draft.ativo} onChange={(e) => set({ ativo: e.target.checked })} /> Plano ativo (o que o paciente segue hoje)</label>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => set({ kcalMeta: metas.kcal, protMeta: metas.prot, carbMeta: metas.carb, gordMeta: metas.gord })} title="Usa o peso da última avaliação"><RefreshCw size={14} /> Recalcular metas</button>
          </div>
        </div>
        <div className="card card-pad" style={{ background: '#f7faf8' }}>
          <div className="strong" style={{ marginBottom: 12 }}>Planejado × meta</div>
          <BarraMeta label="Energia" atual={tot.kcal} meta={draft.kcalMeta} unidade="kcal" />
          <BarraMeta label="Proteína" atual={tot.prot} meta={draft.protMeta} unidade="g" />
          <BarraMeta label="Carboidrato" atual={tot.carb} meta={draft.carbMeta} unidade="g" />
          <BarraMeta label="Gordura" atual={tot.gord} meta={draft.gordMeta} unidade="g" />
          <div className="divider" />
          <div className="row small" style={{ flexWrap: 'wrap', gap: 12 }}>
            <span>Distribuição: <b>P {f0((tot.prot * 4 * 100) / kcalMacros)}%</b> · <b>C {f0((tot.carb * 4 * 100) / kcalMacros)}%</b> · <b>G {f0((tot.gord * 9 * 100) / kcalMacros)}%</b></span>
            <span>Proteína: <b>{f1(tot.prot / peso)} g/kg</b></span>
            <span className={tot.fibra < 25 ? 'text-warning' : ''}>Fibras: <b>{f0(tot.fibra)} g</b>{tot.fibra < 25 ? ' (abaixo de 25 g)' : ''}</span>
          </div>
        </div>
      </div>

      <div className="mt">
        {draft.refeicoes.map((r) => {
          const t = totaisItens(r.itens, mapa);
          return (
            <div key={r.id} className="meal">
              <div className="meal-head">
                <input className="input" list="nomes-refeicao" value={r.nome} onChange={(e) => setRef(r.id, { nome: e.target.value })} style={{ width: 190, fontWeight: 600 }} />
                <input className="input" type="time" value={r.hora} onChange={(e) => setRef(r.id, { hora: e.target.value })} style={{ width: 130 }} />
                <span className="small muted">{f0(t.kcal)} kcal · P {f0(t.prot)} g · C {f0(t.carb)} g · G {f0(t.gord)} g · {f0((t.kcal * 100) / (tot.kcal || 1))}% do dia</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => set({ refeicoes: draft.refeicoes.filter((x) => x.id !== r.id) })}><Trash2 size={14} /> Remover refeição</button>
              </div>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead><tr><th>Alimento</th><th className="num">Quantidade (g)</th><th>Medida caseira</th><th className="num">kcal</th><th className="num">P</th><th className="num">C</th><th className="num">G</th><th /></tr></thead>
                  <tbody>
                    {r.itens.map((it, i) => {
                      const a = mapa.get(it.alimentoId);
                      const fa = it.gramas / 100;
                      const upd = (patch: Partial<typeof it>) => setRef(r.id, { itens: r.itens.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                      return (
                        <tr key={i}>
                          <td><AlimentoSelect value={it.alimentoId} onChange={(id) => upd({ alimentoId: id })} alimentos={db.alimentos} /></td>
                          <td className="num"><input className="input" style={{ width: 80, textAlign: 'right' }} inputMode="numeric" value={it.gramas} onChange={(e) => upd({ gramas: toNumber(e.target.value) })} /></td>
                          <td className="sub">{a ? medidaCaseira(a, it.gramas) : ''}</td>
                          <td className="num">{a ? f0(a.kcal * fa) : '—'}</td>
                          <td className="num">{a ? f1(a.prot * fa) : '—'}</td>
                          <td className="num">{a ? f1(a.carb * fa) : '—'}</td>
                          <td className="num">{a ? f1(a.gord * fa) : '—'}</td>
                          <td className="right"><button className="btn btn-ghost btn-icon btn-sm" aria-label="Remover" onClick={() => setRef(r.id, { itens: r.itens.filter((_, j) => j !== i) })}><X size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '8px 12px' }}>
                <button className="btn btn-sm" onClick={() => setRef(r.id, { itens: [...r.itens, { alimentoId: db.alimentos[0]?.id ?? '', gramas: 100 }] })}><Plus size={14} /> Adicionar alimento</button>
              </div>
            </div>
          );
        })}
        <datalist id="nomes-refeicao">{NOMES_REFEICAO.map((n) => <option key={n} value={n} />)}</datalist>
        <button className="btn mt" onClick={() => set({ refeicoes: [...draft.refeicoes, { id: uid(), nome: 'Ceia', hora: '22:00', itens: [] }] })}><Plus size={16} /> Adicionar refeição</button>
      </div>

      <Field label="Orientações ao paciente" full>
        <textarea className="textarea mt" style={{ minHeight: 110 }} value={draft.orientacoes} onChange={(e) => set({ orientacoes: e.target.value })} />
      </Field>

      {excluir && <Confirm text={`Excluir “${draft.nome}”?`} onClose={() => setExcluir(false)} onConfirm={() => { remove('planos', draft.id); setSelId(planos.find((p) => p.id !== draft.id)?.id ?? ''); toast('Plano excluído.'); }} />}
    </div>
  );
}
