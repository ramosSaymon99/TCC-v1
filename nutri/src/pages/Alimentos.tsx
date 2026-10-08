import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/Store';
import { Confirm, Empty, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../components/ui';
import { Field, toNumber } from '../components/fields';
import type { Alimento } from '../types';
import { normalize, uid } from '../utils/format';

function AlimentoModal({ alimento, grupos, onClose }: { alimento?: Alimento; grupos: string[]; onClose: () => void }) {
  const { upsert, toast } = useStore();
  const [f, setF] = useState<Alimento>(alimento ?? { id: uid(), nome: '', grupo: grupos[0] ?? 'Outros', kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0, medida: 'colher de sopa', gMedida: 15 });
  const set = <K extends keyof Alimento>(k: K, v: Alimento[K]) => setF((x) => ({ ...x, [k]: v }));
  const kcalMacros = f.prot * 4 + f.carb * 4 + f.gord * 9;
  const salvar = (e: FormEvent) => { e.preventDefault(); upsert('alimentos', f); toast('Alimento salvo.'); onClose(); };
  return (
    <Modal title={alimento ? 'Editar alimento' : 'Novo alimento'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" type="submit" form="f-al">Salvar</button>
    </>}>
      <form id="f-al" className="form-grid" onSubmit={salvar}>
        <Field label="Nome" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Field>
        <Field label="Grupo"><input className="input" list="grupos-al" value={f.grupo} onChange={(e) => set('grupo', e.target.value)} required /><datalist id="grupos-al">{grupos.map((g) => <option key={g} value={g} />)}</datalist></Field>
        <Field label="Energia (kcal / 100 g)" hint={kcalMacros && Math.abs(kcalMacros - f.kcal) > f.kcal * 0.15 ? `Atenção: macros somam ${Math.round(kcalMacros)} kcal` : undefined}><input className="input" inputMode="decimal" value={f.kcal} onChange={(e) => set('kcal', toNumber(e.target.value))} /></Field>
        <Field label="Proteína (g / 100 g)"><input className="input" inputMode="decimal" value={f.prot} onChange={(e) => set('prot', toNumber(e.target.value))} /></Field>
        <Field label="Carboidrato (g / 100 g)"><input className="input" inputMode="decimal" value={f.carb} onChange={(e) => set('carb', toNumber(e.target.value))} /></Field>
        <Field label="Gordura (g / 100 g)"><input className="input" inputMode="decimal" value={f.gord} onChange={(e) => set('gord', toNumber(e.target.value))} /></Field>
        <Field label="Fibras (g / 100 g)"><input className="input" inputMode="decimal" value={f.fibra} onChange={(e) => set('fibra', toNumber(e.target.value))} /></Field>
        <Field label="Medida caseira"><input className="input" value={f.medida} onChange={(e) => set('medida', e.target.value)} /></Field>
        <Field label="Gramas da medida"><input className="input" inputMode="decimal" value={f.gMedida} onChange={(e) => set('gMedida', toNumber(e.target.value))} /></Field>
      </form>
    </Modal>
  );
}

export default function Alimentos() {
  const { db, remove, toast } = useStore();
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');
  const [edit, setEdit] = useState<Alimento | 'novo' | null>(null);
  const [del, setDel] = useState<Alimento | null>(null);
  const grupos = useMemo(() => [...new Set(db.alimentos.map((a) => a.grupo))].sort(), [db.alimentos]);
  const usados = useMemo(() => {
    const m = new Map<string, number>();
    db.planos.forEach((p) => p.refeicoes.forEach((r) => r.itens.forEach((i) => m.set(i.alimentoId, (m.get(i.alimentoId) ?? 0) + 1))));
    return m;
  }, [db.planos]);
  const rows = useMemo(() => db.alimentos
    .filter((a) => (!grupo || a.grupo === grupo) && (!q || normalize(a.nome).includes(normalize(q))))
    .map((a) => ({ ...a, densProt: a.kcal ? (a.prot * 4) / a.kcal : 0, usos: usados.get(a.id) ?? 0 })), [db.alimentos, grupo, q, usados]);
  const s = useSortPage(rows, 15, { key: 'nome', dir: 'asc' });

  return (
    <>
      <PageHeader title="Alimentos" subtitle="Tabela de composição usada nos planos alimentares · valores por 100 g (base TACO/USDA, revise antes de usar)">
        <button className="btn btn-primary" onClick={() => setEdit('novo')}><Plus size={16} /> Novo alimento</button>
      </PageHeader>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar alimento" />
          <select className="select" value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.map((g) => <option key={g}>{g}</option>)}</select>
        </div>
        <div className="table-wrap">
          <table className="table table-compact">
            <thead><tr>
              <Th label="Alimento" k="nome" s={s} /><Th label="Grupo" k="grupo" s={s} />
              <Th label="kcal" k="kcal" s={s} className="num" /><Th label="Proteína" k="prot" s={s} className="num" /><Th label="Carbo" k="carb" s={s} className="num" />
              <Th label="Gordura" k="gord" s={s} className="num" /><Th label="Fibras" k="fibra" s={s} className="num" />
              <Th label="% kcal de proteína" k="densProt" s={s} className="num" /><th>Medida caseira</th><Th label="Usos em planos" k="usos" s={s} className="num" /><th />
            </tr></thead>
            <tbody>
              {s.view.map((a) => (
                <tr key={a.id}>
                  <td className="strong">{a.nome}</td><td className="sub">{a.grupo}</td>
                  <td className="num">{a.kcal}</td><td className="num">{a.prot}</td><td className="num">{a.carb}</td><td className="num">{a.gord}</td><td className="num">{a.fibra}</td>
                  <td className="num">{Math.round(a.densProt * 100)}%</td>
                  <td className="sub">{a.medida} ({a.gMedida} g)</td>
                  <td className="num">{a.usos}</td>
                  <td className="right"><RowMenu actions={[
                    { label: <><Pencil size={14} /> Editar</>, onClick: () => setEdit(a) },
                    { label: <><Trash2 size={14} /> Excluir</>, onClick: () => setDel(a), danger: true },
                  ]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhum alimento encontrado." />}
        </div>
        <Pager {...s} noun="alimentos" />
      </div>
      {edit && <AlimentoModal alimento={edit === 'novo' ? undefined : edit} grupos={grupos} onClose={() => setEdit(null)} />}
      {del && <Confirm text={del && usados.get(del.id) ? `“${del.nome}” está em ${usados.get(del.id)} item(ns) de planos e sumirá deles. Excluir mesmo assim?` : `Excluir “${del.nome}”?`}
        onClose={() => setDel(null)} onConfirm={() => { remove('alimentos', del.id); toast('Alimento excluído.'); }} />}
    </>
  );
}
