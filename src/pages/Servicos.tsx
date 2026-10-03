import { useMemo, useState } from 'react';
import { BadgePercent, Clock, Lightbulb, Pencil, Plus, Tag, Trash2, TrendingDown } from 'lucide-react';
import { useStore } from '../store/Store';
import type { CategoriaServico, Servico } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, SearchInput, Th, useSortPage } from '../components/ui';
import { Field, Options, toNumber } from '../components/fields';
import { addDays, money, normalize, pct, today, uid } from '../utils/format';
import { CATEGORIAS } from '../store/seed';

type Classe = 'Carro-chefe' | 'Volume' | 'Nicho' | 'Revisar' | 'Sem vendas';
type Row = Servico & {
  margem: number; porHora: number; qtd: number; receita: number; praticado: number; desvio: number | null; classe: Classe;
};

const CLASSE_TONE: Record<Classe, string> = { 'Carro-chefe': 'green', Volume: 'orange', Nicho: 'blue', Revisar: 'red', 'Sem vendas': 'gray' };
const CLASSE_DICA: Record<Classe, string> = {
  'Carro-chefe': 'Vende muito e tem boa margem: proteger e destacar.',
  Volume: 'Vende muito, mas com margem abaixo da mediana: revisar preço ou custo.',
  Nicho: 'Boa margem, pouco vendido: oportunidade de divulgação e cross-sell.',
  Revisar: 'Pouco vendido e margem baixa: reprecificar, reempacotar ou descontinuar.',
  'Sem vendas': 'Nenhuma venda nos últimos 90 dias.',
};
const JANELA = 90;

export default function Servicos() {
  const { db, upsert, remove, toast } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<Servico | null>(null);
  const [deleting, setDeleting] = useState<Servico | null>(null);
  const hoje = today();

  const rows: Row[] = useMemo(() => {
    const ini = addDays(hoje, -JANELA);
    const vendas = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.data >= ini);
    const base = db.servicos.map((s) => {
      const v = vendas.filter((l) => normalize(l.descricao) === normalize(s.nome));
      const receita = v.reduce((a, l) => a + l.valor, 0);
      const praticado = v.length ? receita / v.length : 0;
      return {
        ...s, qtd: v.length, receita, praticado,
        margem: s.preco ? (s.preco - s.custo) / s.preco : 0,
        porHora: s.duracaoHoras ? (s.preco - s.custo) / s.duracaoHoras : 0,
        desvio: v.length && s.preco ? (praticado - s.preco) / s.preco : null,
      };
    });
    const vendidos = base.filter((r) => r.qtd > 0);
    const mediana = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : 0; };
    const medRec = mediana(vendidos.map((r) => r.receita));
    const medMarg = mediana(base.map((r) => r.margem));
    return base.map((r) => ({
      ...r,
      classe: (r.qtd === 0 ? 'Sem vendas'
        : r.receita >= medRec ? (r.margem >= medMarg ? 'Carro-chefe' : 'Volume')
          : (r.margem >= medMarg ? 'Nicho' : 'Revisar')) as Classe,
    }));
  }, [db.servicos, db.lancamentos, hoje]);

  const filtered = rows.filter((r) => (!cat || r.categoria === cat) && (!q || normalize(r.nome).includes(normalize(q))));
  const s = useSortPage<Row>(filtered, 10, { key: 'receita', dir: 'desc' });

  const ativos = rows.filter((r) => r.ativo);
  const recTotal = rows.reduce((a, r) => a + r.receita, 0);
  const margemPond = recTotal ? rows.reduce((a, r) => a + r.margem * r.receita, 0) / recTotal : 0;
  const horas = rows.reduce((a, r) => a + r.duracaoHoras * r.qtd, 0);
  const lucroHora = horas ? rows.reduce((a, r) => a + (r.praticado - r.custo) * r.qtd, 0) / horas : 0;
  const comDesvio = rows.filter((r) => r.desvio !== null);
  const descontoMedio = comDesvio.length
    ? comDesvio.reduce((a, r) => a + r.desvio! * r.qtd, 0) / comDesvio.reduce((a, r) => a + r.qtd, 0) : 0;
  const perdaDesconto = comDesvio.filter((r) => r.desvio! < 0).reduce((a, r) => a + (r.preco - r.praticado) * r.qtd, 0);

  const insights: string[] = [];
  const maiorDesc = [...comDesvio].sort((a, b) => a.desvio! - b.desvio!)[0];
  if (maiorDesc && maiorDesc.desvio! < -0.1) {
    insights.push(`"${maiorDesc.nome}" está sendo vendido ${pct(Math.abs(maiorDesc.desvio!))} abaixo da tabela (${money(maiorDesc.praticado)} vs ${money(maiorDesc.preco)}). Padronizar o preço recuperaria ~${money((maiorDesc.preco - maiorDesc.praticado) * maiorDesc.qtd)} a cada ${JANELA} dias.`);
  }
  const volume = rows.filter((r) => r.classe === 'Volume');
  if (volume.length) insights.push(`${volume.map((r) => r.nome).join(', ')}: alto volume com margem abaixo da mediana. Um reajuste de 10% somaria ~${money(volume.reduce((a, r) => a + r.praticado * 0.1 * r.qtd, 0))} em ${JANELA} dias, mantendo o volume.`);
  const nicho = rows.filter((r) => r.classe === 'Nicho');
  if (nicho.length) insights.push(`${nicho.map((r) => r.nome).join(', ')}: margem alta e pouca venda. Bons candidatos para divulgação e oferta à base atual.`);
  const semVenda = rows.filter((r) => r.classe === 'Sem vendas' && r.ativo);
  if (semVenda.length) insights.push(`${semVenda.length} serviço(s) ativo(s) sem venda nos últimos ${JANELA} dias: ${semVenda.map((r) => r.nome).join(', ')}.`);

  return (
    <>
      <PageHeader title="Serviços e Preços" subtitle={`Catálogo com preço de tabela, custo e rentabilidade. Desempenho calculado sobre os últimos ${JANELA} dias.`}>
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), nome: '', categoria: 'Manutenção', preco: 0, custo: 0, duracaoHoras: 1, ativo: true })}>
          <Plus size={16} /> Novo serviço
        </button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<Tag size={20} />} tone="blue" label="Serviços ativos" value={ativos.length} foot={`${rows.filter((r) => r.qtd > 0).length} com venda em ${JANELA} dias`} />
        <Kpi icon={<BadgePercent size={20} />} tone="green" label="Margem sobre custo direto" value={pct(margemPond)} foot="Não inclui sua mão de obra: veja o lucro por hora" />
        <Kpi icon={<Clock size={20} />} tone="purple" label="Lucro por hora trabalhada" value={money(lucroHora)} foot={`${horas.toFixed(0)}h estimadas em ${JANELA} dias`} />
        <Kpi icon={<TrendingDown size={20} />} tone={descontoMedio < -0.05 ? 'red' : 'orange'} label="Preço praticado vs. tabela" value={`${descontoMedio >= 0 ? '+' : '−'}${pct(Math.abs(descontoMedio), 1)}`}
          foot={perdaDesconto > 0 ? <span className="text-danger strong">{money(perdaDesconto)} concedidos em descontos</span> : 'Sem descontos relevantes'} />
      </div>

      {insights.length > 0 && (
        <div className="insight opp" style={{ marginBottom: 16 }}>
          <div className="ico tone-blue"><Lightbulb size={16} /></div>
          <div>{insights.map((t) => <div key={t} className="d">• {t}</div>)}</div>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar serviço..." />
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option><Options items={CATEGORIAS} /></select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Serviço" k="nome" s={s} />
                <Th label="Preço tabela" k="preco" s={s} className="num" />
                <Th label="Margem" k="margem" s={s} className="num" />
                <Th label="Lucro/hora" k="porHora" s={s} className="num hide-sm" />
                <Th label="Vendas" k="qtd" s={s} className="num" />
                <Th label="Preço praticado" k="praticado" s={s} className="num hide-sm" />
                <Th label="Receita" k="receita" s={s} className="num" />
                <Th label="Classificação" k="classe" s={s} />
                <th className="right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.view.map((r) => (
                <tr key={r.id} style={{ opacity: r.ativo ? 1 : 0.55 }}>
                  <td><div className="strong">{r.nome}</div><div className="sub">{r.categoria} · {r.duracaoHoras}h{!r.ativo && ' · inativo'}</div></td>
                  <td className="num">{money(r.preco)}<div className="sub">custo {money(r.custo)}</div></td>
                  <td className={`num strong ${r.margem < 0.5 ? 'text-warning' : ''}`}>{pct(r.margem)}</td>
                  <td className="num hide-sm">{money(r.porHora)}</td>
                  <td className="num">{r.qtd}</td>
                  <td className="num hide-sm">
                    {r.qtd ? money(r.praticado) : '—'}
                    {r.desvio !== null && <div className={`sub ${r.desvio < -0.05 ? 'text-danger' : r.desvio > 0.05 ? 'text-success' : ''}`}>{r.desvio >= 0 ? '+' : '−'}{pct(Math.abs(r.desvio))} vs tabela</div>}
                  </td>
                  <td className="num strong">{money(r.receita)}<div className="sub">{recTotal ? pct(r.receita / recTotal, 1) : '0%'}</div></td>
                  <td title={CLASSE_DICA[r.classe]}><Badge tone={CLASSE_TONE[r.classe]}>{r.classe}</Badge></td>
                  <td className="right nowrap">
                    <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => setEditing(r)}><Pencil size={15} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" onClick={() => setDeleting(r)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhum serviço encontrado." />}
        </div>
        <Pager {...s} noun="serviços" />
        <div className="legend" style={{ padding: '0 20px 16px' }}>
          {(Object.keys(CLASSE_DICA) as Classe[]).map((c) => <span key={c}><Badge tone={CLASSE_TONE[c]}>{c}</Badge> <span className="muted">{CLASSE_DICA[c]}</span></span>)}
        </div>
      </div>

      {editing && <ServicoForm s={editing} onClose={() => setEditing(null)} onSave={(x) => {
        if (!x.nome || x.preco <= 0) return toast('Informe nome e preço.', 'error');
        upsert('servicos', x); toast('Serviço salvo.'); setEditing(null);
      }} />}
      {deleting && <Confirm text={<>Excluir <strong>{deleting.nome}</strong> do catálogo? O histórico de vendas é mantido. Prefira marcar como inativo.</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('servicos', deleting.id); toast('Serviço excluído.'); }} />}
    </>
  );
}

function ServicoForm({ s, onClose, onSave }: { s: Servico; onClose: () => void; onSave: (s: Servico) => void }) {
  const [f, setF] = useState(s);
  const set = <K extends keyof Servico>(k: K, v: Servico[K]) => setF((x) => ({ ...x, [k]: v }));
  const margem = f.preco ? (f.preco - f.custo) / f.preco : 0;
  return (
    <Modal title={s.nome ? 'Editar serviço' : 'Novo serviço'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="serv-form">Salvar</button>
    </>}>
      <form id="serv-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Nome do serviço" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Field>
        <Field label="Categoria"><select className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value as CategoriaServico)}><Options items={CATEGORIAS} /></select></Field>
        <Field label="Horas estimadas"><input className="input" type="number" min={0.5} step={0.5} value={f.duracaoHoras} onChange={(e) => set('duracaoHoras', Number(e.target.value))} /></Field>
        <Field label="Preço de tabela (R$)"><input className="input" inputMode="decimal" defaultValue={f.preco ? String(f.preco).replace('.', ',') : ''} onChange={(e) => set('preco', toNumber(e.target.value))} required /></Field>
        <Field label="Custo direto (R$)" hint="Peças, material, deslocamento."><input className="input" inputMode="decimal" defaultValue={f.custo ? String(f.custo).replace('.', ',') : ''} onChange={(e) => set('custo', toNumber(e.target.value))} /></Field>
        <div className="full small muted">
          Margem: <strong className={margem < 0.5 ? 'text-warning' : 'text-success'}>{pct(margem)}</strong> ·
          Lucro por hora: <strong>{money(f.duracaoHoras ? (f.preco - f.custo) / f.duracaoHoras : 0)}</strong>
        </div>
        <Field label="Descrição" full><textarea className="textarea" value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <label className="check full"><input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Serviço ativo (aparece nos orçamentos)</label>
      </form>
    </Modal>
  );
}
