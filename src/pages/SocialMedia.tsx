import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Copy, Eye, Heart, Lightbulb, Megaphone,
  MessageCircle, Plus, Target, Trash2, TrendingUp, Users,
} from 'lucide-react';
import { useStore } from '../store/Store';
import type { CategoriaServico, FormatoPost, PilarConteudo, Post, RedeSocial, Seguidores, StatusPost } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader, Pager, RowMenu, Th, Trend, useSortPage } from '../components/ui';
import { Field, Options, toNumber } from '../components/fields';
import { addDays, date, DIAS_SEMANA, int, MESES_LONGOS, money, monthLabel, parseDate, pct, toISODate, today, uid, variation } from '../utils/format';
import { CATEGORIAS } from '../store/seed';
import {
  agrupar, atribuicao, COR_REDE, engajamento, insightsSocial, interacoes, porSemana, REDES, resumoPosts, sugerirPautas, type Pauta,
} from '../utils/social';

const FORMATOS: FormatoPost[] = ['Feed', 'Carrossel', 'Reels', 'Stories', 'Vídeo', 'Artigo', 'Status'];
const PILARES: PilarConteudo[] = ['Educativo', 'Institucional', 'Promocional', 'Prova social', 'Bastidores'];
const STATUS: StatusPost[] = ['Ideia', 'Produzindo', 'Agendado', 'Publicado'];
const STATUS_TONE: Record<StatusPost, string> = { Ideia: 'gray', Produzindo: 'orange', Agendado: 'blue', Publicado: 'green' };
const ICON_KIND = { risk: AlertTriangle, warn: AlertTriangle, good: CheckCircle2, opp: Lightbulb };
const TONE_KIND = { risk: 'red', warn: 'orange', good: 'green', opp: 'blue' };

type Aba = 'visao' | 'calendario' | 'posts' | 'roi';

const postVazio = (data: string): Post => ({
  id: uid(), titulo: '', rede: 'Instagram', formato: 'Reels', pilar: 'Educativo', data, hora: '18:30', status: 'Ideia', investimento: 0,
  alcance: 0, impressoes: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0, salvamentos: 0, cliques: 0, mensagens: 0,
});

export default function SocialMedia() {
  const { db, upsert, remove, toast } = useStore();
  const [aba, setAba] = useState<Aba>('visao');
  const [dias, setDias] = useState(30);
  const [editing, setEditing] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [segOpen, setSegOpen] = useState(false);
  const hoje = today();

  const de = addDays(hoje, -(dias - 1));
  const antAte = addDays(de, -1);
  const antDe = addDays(antAte, -(dias - 1));
  const atual = resumoPosts(db.posts.filter((p) => p.data >= de && p.data <= hoje));
  const ant = resumoPosts(db.posts.filter((p) => p.data >= antDe && p.data <= antAte));
  const atrAtual = atribuicao(db, de, hoje);
  const leadsSociais = atrAtual.filter((a) => a.social);
  const leads = leadsSociais.reduce((a, x) => a + x.leads, 0);
  const leadsAnt = atribuicao(db, antDe, antAte).filter((a) => a.social).reduce((a, x) => a + x.leads, 0);
  const receita = leadsSociais.reduce((a, x) => a + x.receita, 0);
  const investido = leadsSociais.reduce((a, x) => a + x.investimento, 0);
  const pipeline = leadsSociais.reduce((a, x) => a + x.pipeline, 0);
  const meta = db.empresa.metaPostsSemana ?? 3;
  const freq = atual.posts / (dias / 7);

  const insights = useMemo(() => insightsSocial(db, hoje), [db, hoje]);
  const pautas = useMemo(() => sugerirPautas(db, hoje), [db, hoje]);

  const salvar = (p: Post) => {
    if (!p.titulo.trim()) return toast('Informe o título do post.', 'error');
    upsert('posts', p);
    toast('Post salvo.');
    setEditing(null);
  };
  const usarPauta = (pt: Pauta) => {
    const data = addDays(hoje, 2);
    setEditing({ ...postVazio(data), titulo: pt.titulo, pilar: pt.pilar, categoria: pt.categoria, rede: pt.rede, formato: pt.formato, legenda: pt.motivo, status: 'Ideia' });
  };

  return (
    <>
      <PageHeader title="Social Media" subtitle="Planejamento editorial, desempenho dos conteúdos e quanto as redes geram de leads e vendas.">
        <select className="select" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ width: 170 }}>
          <option value={30}>Últimos 30 dias</option>
          <option value={60}>Últimos 60 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <button className="btn" onClick={() => setSegOpen(true)}><Users size={16} /> Seguidores</button>
        <button className="btn btn-primary" onClick={() => setEditing(postVazio(addDays(hoje, 1)))}><Plus size={16} /> Novo post</button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <Kpi icon={<Eye size={20} />} tone="blue" label="Alcance" value={int(atual.alcance)}
          foot={<><Trend value={variation(atual.alcance, ant.alcance)} /> · {int(atual.impressoes)} impressões</>} />
        <Kpi icon={<Heart size={20} />} tone="purple" label="Taxa de engajamento" value={pct(atual.engajamento, 1)}
          foot={<><span className={`trend ${atual.engajamento >= ant.engajamento ? 'up' : 'down'}`}>{atual.engajamento >= ant.engajamento ? '+' : '−'}{((Math.abs(atual.engajamento - ant.engajamento)) * 100).toFixed(1).replace('.', ',')} p.p.</span> · {int(atual.interacoes)} interações</>} />
        <Kpi icon={<MessageCircle size={20} />} tone="green" label="Leads das redes" value={leads}
          foot={<><span className={`trend ${leads > leadsAnt ? 'up' : leads < leadsAnt ? 'down' : 'flat'}`}>{leads >= leadsAnt ? '+' : '−'}{Math.abs(leads - leadsAnt)}</span> ({leadsAnt} antes) · {int(atual.mensagens)} mensagens</>} />
        <Kpi icon={<TrendingUp size={20} />} tone="orange" label="Receita atribuída" value={money(receita)}
          foot={`${money(pipeline)} em negociação · ${investido ? `retorno ${(receita / investido).toFixed(1).replace('.', ',')}× o investido` : 'sem impulsionamento'}`} />
        <Kpi icon={<Target size={20} />} tone={freq >= meta ? 'green' : 'red'} label="Posts por semana" value={freq.toFixed(1).replace('.', ',')}
          foot={<span className={freq >= meta ? 'text-success strong' : 'text-danger strong'}>Meta: {meta}/semana · {atual.posts} no período</span>}>
          <div className="meter"><span style={{ width: `${Math.min(100, (freq / meta) * 100)}%`, background: freq >= meta ? 'var(--success)' : 'var(--danger)' }} /></div>
        </Kpi>
      </div>

      <div className="card">
        <div className="tabs">
          {([['visao', 'Visão geral'], ['calendario', 'Calendário editorial'], ['posts', 'Posts e métricas'], ['roi', 'Leads e ROI']] as const).map(([k, l]) => (
            <button key={k} className={`tab ${aba === k ? 'active' : ''}`} onClick={() => setAba(k)}>{l}</button>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          {aba === 'visao' && <Visao insights={insights} pautas={pautas} usarPauta={usarPauta} dias={dias} />}
          {aba === 'calendario' && <Calendario abrir={setEditing} novo={(d) => setEditing(postVazio(d))} />}
          {aba === 'posts' && <ListaPosts abrir={setEditing} excluir={setDeleting} duplicar={(p) => setEditing({ ...p, id: uid(), status: 'Ideia', data: addDays(hoje, 3), investimento: 0, alcance: 0, impressoes: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0, salvamentos: 0, cliques: 0, mensagens: 0 })} />}
          {aba === 'roi' && <Roi de={de} ate={hoje} />}
        </div>
      </div>

      {editing && <PostForm p={editing} onClose={() => setEditing(null)} onSave={salvar} />}
      {segOpen && <SeguidoresForm onClose={() => setSegOpen(false)} />}
      {deleting && <Confirm text={<>Excluir o post <strong>{deleting.titulo}</strong>?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('posts', deleting.id); toast('Post excluído.'); }} />}
    </>
  );
}

/* ---------------- Visão geral ---------------- */
function Visao({ insights, pautas, usarPauta, dias }: { insights: ReturnType<typeof insightsSocial>; pautas: Pauta[]; usarPauta: (p: Pauta) => void; dias: number }) {
  const { db } = useStore();
  const hoje = today();
  const semanas = porSemana(db.posts, Math.round(dias / 7) + 1, hoje);
  const de = addDays(hoje, -(dias - 1));
  const periodo = db.posts.filter((p) => p.data >= de && p.data <= hoje);
  const formatos = agrupar(periodo, 'formato');
  const pilares = agrupar(periodo, 'pilar');
  const redes = agrupar(periodo, 'rede');
  const top = periodo.filter((p) => p.status === 'Publicado').sort((a, b) => interacoes(b) - interacoes(a)).slice(0, 5);

  const meses = [...new Set(db.seguidores.map((s) => s.mes))].sort();
  const redesSeg = [...new Set(db.seguidores.map((s) => s.rede))] as RedeSocial[];
  const serieSeg = meses.map((m) => ({ mes: monthLabel(m), ...Object.fromEntries(redesSeg.map((r) => [r, db.seguidores.find((s) => s.mes === m && s.rede === r)?.seguidores ?? null])) }));
  const crescimento = redesSeg.map((r) => {
    const xs = db.seguidores.filter((s) => s.rede === r).sort((a, b) => a.mes.localeCompare(b.mes));
    const ult = xs[xs.length - 1], pen = xs[xs.length - 2];
    return { rede: r, atual: ult?.seguidores ?? 0, var: ult && pen ? variation(ult.seguidores, pen.seguidores) : null };
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {insights.length > 0 && (
        <div className="grid g-2" style={{ gap: 10 }}>
          {insights.map((i) => {
            const Icon = ICON_KIND[i.kind];
            return (
              <div key={i.title} className={`insight ${i.kind}`}>
                <div className={`ico tone-${TONE_KIND[i.kind]}`}><Icon size={16} /></div>
                <div><div className="t">{i.title}</div><div className="d">{i.detail}</div></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid g-3-2">
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-head"><div><h3>Alcance e engajamento por semana</h3><div className="card-sub">Barras: alcance · Linha: taxa de engajamento (%)</div></div></div>
          <div className="chart-box" style={{ height: 250 }}>
            <ResponsiveContainer>
              <ComposedChart data={semanas} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="a" tickLine={false} axisLine={false} fontSize={11} width={48} />
                <YAxis yAxisId="e" orientation="right" tickLine={false} axisLine={false} fontSize={11} width={36} unit="%" />
                <Tooltip formatter={(v, n) => (n === 'Engajamento' ? `${Number(v).toFixed(1).replace('.', ',')}%` : int(Number(v)))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="a" dataKey="alcance" name="Alcance" fill="#9cc2f7" radius={[4, 4, 0, 0]} maxBarSize={34} />
                <Line yAxisId="e" dataKey="engPct" name="Engajamento" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-head"><h3>Seguidores por rede</h3></div>
          <div className="chart-box" style={{ height: 170 }}>
            <ResponsiveContainer>
              <LineChart data={serieSeg} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
                <Tooltip formatter={(v) => int(Number(v))} />
                {redesSeg.map((r) => <Line key={r} dataKey={r} stroke={COR_REDE[r]} strokeWidth={2.2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding: '0 20px 14px' }}>
            {crescimento.map((c) => (
              <div key={c.rede} className="row between small" style={{ padding: '4px 0' }}>
                <span className="row"><i style={{ width: 10, height: 10, borderRadius: 3, background: COR_REDE[c.rede], display: 'inline-block' }} />{c.rede}</span>
                <span><strong>{int(c.atual)}</strong> <Trend value={c.var} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g-2">
        <Tabela titulo="Desempenho por formato" sub="Qual formato entrega mais alcance e conversa" linhas={formatos} />
        <Tabela titulo="Desempenho por pilar de conteúdo" sub="Engajamento constrói audiência; mensagens geram vendas" linhas={pilares} />
      </div>

      <div className="grid g-2">
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-head"><h3>Melhores posts do período</h3></div>
          <ul className="list">
            {top.map((p, i) => (
              <li key={p.id}>
                <strong className="muted" style={{ width: 18 }}>{i + 1}</strong>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{p.titulo}</div>
                  <div className="desc">{p.rede} · {p.formato} · {p.pilar} · {date(p.data)}</div>
                </div>
                <div className="right small"><strong>{pct(engajamento(p), 1)}</strong><div className="muted">{int(p.alcance)} alcance</div></div>
              </li>
            ))}
            {top.length === 0 && <li className="muted">Nenhum post publicado no período.</li>}
          </ul>
          <div className="small muted" style={{ padding: '0 20px 14px' }}>Por rede: {redes.map((r) => `${r.chave} ${pct(r.engajamento, 1)}`).join(' · ')}</div>
        </div>

        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-head"><div><h3 className="row"><Lightbulb size={16} color="var(--primary)" /> Sugestões de pauta</h3><div className="card-sub">Geradas a partir de turmas, serviços, avaliações e contratos</div></div></div>
          <ul className="list">
            {pautas.map((pt) => (
              <li key={pt.titulo}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{pt.titulo}</div>
                  <div className="desc">{pt.motivo}</div>
                  <div className="small" style={{ marginTop: 4 }}><Badge tone="purple">{pt.pilar}</Badge> <span className="muted">{pt.rede} · {pt.formato}</span></div>
                </div>
                <button className="btn btn-sm btn-outline-primary" onClick={() => usarPauta(pt)}><Plus size={14} /> Planejar</button>
              </li>
            ))}
            {pautas.length === 0 && <li className="muted">Sem sugestões no momento.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tabela({ titulo, sub, linhas }: { titulo: string; sub: string; linhas: ReturnType<typeof agrupar> }) {
  const maxEng = Math.max(...linhas.map((l) => l.engajamento), 0);
  const maxMsg = Math.max(...linhas.map((l) => l.mensagens), 0);
  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="card-head"><div><h3>{titulo}</h3><div className="card-sub">{sub}</div></div></div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="table table-compact">
          <thead><tr><th /><th className="num">Posts</th><th className="num">Alcance médio</th><th className="num">Engajamento</th><th className="num">Mensagens</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave}>
                <td className="strong">{l.chave}</td>
                <td className="num">{l.posts}</td>
                <td className="num">{int(Math.round(l.alcanceMedio))}</td>
                <td className={`num ${l.engajamento === maxEng ? 'text-success strong' : ''}`}>{pct(l.engajamento, 1)}</td>
                <td className={`num ${l.mensagens === maxMsg && maxMsg > 0 ? 'text-success strong' : ''}`}>{int(l.mensagens)}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={5} className="empty">Sem posts publicados no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Calendário editorial ---------------- */
function Calendario({ abrir, novo }: { abrir: (p: Post) => void; novo: (data: string) => void }) {
  const { db } = useStore();
  const hoje = today();
  const [ref, setRef] = useState(hoje.slice(0, 7) + '-01');
  const d = parseDate(ref);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = addDays(toISODate(first), -first.getDay());
  const doMes = db.posts.filter((p) => p.data.startsWith(ref.slice(0, 7)));
  const contagem = Object.fromEntries(STATUS.map((s) => [s, db.posts.filter((p) => p.status === s && (s === 'Publicado' ? p.data.startsWith(ref.slice(0, 7)) : true)).length]));

  return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setRef(hoje.slice(0, 7) + '-01')}>Hoje</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setRef(toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)))} aria-label="Anterior"><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 150, textAlign: 'center' }}>{MESES_LONGOS[d.getMonth()][0].toUpperCase() + MESES_LONGOS[d.getMonth()].slice(1)} de {d.getFullYear()}</strong>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setRef(toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1)))} aria-label="Próximo"><ChevronRight size={16} /></button>
          <span className="small muted">{doMes.length} post(s) no mês</span>
        </div>
        <div className="row small" style={{ flexWrap: 'wrap' }}>
          <span className="muted">Produção:</span>
          {STATUS.map((s) => <Badge key={s} tone={STATUS_TONE[s]}>{s}: {contagem[s]}</Badge>)}
        </div>
      </div>
      <div className="month">
        {DIAS_SEMANA.map((w) => <div key={w} className="dow">{w.slice(0, 3)}</div>)}
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((iso) => {
          const posts = db.posts.filter((p) => p.data === iso);
          return (
            <div key={iso} className={`cell ${parseDate(iso).getMonth() !== d.getMonth() ? 'out' : ''} ${iso === hoje ? 'today' : ''}`} onClick={() => novo(iso)} title="Clique para planejar um post neste dia">
              <div className="n">{parseDate(iso).getDate()}</div>
              {posts.slice(0, 3).map((p) => (
                <div key={p.id} className="pill" style={{ borderLeftColor: COR_REDE[p.rede], background: p.status === 'Publicado' ? '#f3f6fb' : '#fff', opacity: p.status === 'Ideia' ? 0.7 : 1 }}
                  onClick={(e) => { e.stopPropagation(); abrir(p); }} title={`${p.titulo} · ${p.rede} · ${p.status}`}>
                  {p.status === 'Publicado' ? '✓ ' : ''}{p.titulo}
                </div>
              ))}
              {posts.length > 3 && <div className="muted">+{posts.length - 3}</div>}
            </div>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        {REDES.map((r) => <span key={r}><i style={{ background: COR_REDE[r] }} />{r}</span>)}
        <span className="muted">· ✓ publicado · clique num dia vazio para planejar</span>
      </div>
    </>
  );
}

/* ---------------- Lista de posts ---------------- */
type Row = Post & { eng: number; inter: number };
function ListaPosts({ abrir, excluir, duplicar }: { abrir: (p: Post) => void; excluir: (p: Post) => void; duplicar: (p: Post) => void }) {
  const { db } = useStore();
  const [rede, setRede] = useState('');
  const [status, setStatus] = useState('');
  const [pilar, setPilar] = useState('');
  const rows: Row[] = db.posts.filter((p) => (!rede || p.rede === rede) && (!status || p.status === status) && (!pilar || p.pilar === pilar))
    .map((p) => ({ ...p, eng: engajamento(p), inter: interacoes(p) }));
  const s = useSortPage<Row>(rows, 12, { key: 'data', dir: 'desc' });
  const leadsPorPost = (id: string) => db.oportunidades.filter((o) => o.postId === id).length;
  return (
    <>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto' }} value={rede} onChange={(e) => setRede(e.target.value)}><option value="">Todas as redes</option><Options items={REDES} /></select>
        <select className="select" style={{ width: 'auto' }} value={pilar} onChange={(e) => setPilar(e.target.value)}><option value="">Todos os pilares</option><Options items={PILARES} /></select>
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option><Options items={STATUS} /></select>
      </div>
      <div className="table-wrap" style={{ margin: '0 -20px' }}>
        <table className="table">
          <thead>
            <tr>
              <Th label="Data" k="data" s={s} />
              <Th label="Post" k="titulo" s={s} />
              <Th label="Pilar" k="pilar" s={s} className="hide-sm" />
              <Th label="Alcance" k="alcance" s={s} className="num" />
              <Th label="Engajamento" k="eng" s={s} className="num" />
              <Th label="Cliques" k="cliques" s={s} className="num hide-sm" />
              <Th label="Mensagens" k="mensagens" s={s} className="num" />
              <Th label="Investido" k="investimento" s={s} className="num hide-sm" />
              <Th label="Status" k="status" s={s} />
              <th />
            </tr>
          </thead>
          <tbody>
            {s.view.map((p) => {
              const nl = leadsPorPost(p.id);
              return (
                <tr key={p.id} className="clickable" onClick={() => abrir(p)}>
                  <td className="nowrap">{date(p.data)}<div className="sub">{p.hora}</div></td>
                  <td><div className="strong">{p.titulo}</div><div className="sub"><span style={{ color: COR_REDE[p.rede], fontWeight: 600 }}>{p.rede}</span> · {p.formato}{nl ? ` · ${nl} lead(s)` : ''}</div></td>
                  <td className="hide-sm">{p.pilar}</td>
                  <td className="num">{p.status === 'Publicado' ? int(p.alcance) : '—'}</td>
                  <td className="num strong">{p.status === 'Publicado' ? pct(p.eng, 1) : '—'}</td>
                  <td className="num hide-sm">{p.status === 'Publicado' ? int(p.cliques) : '—'}</td>
                  <td className="num">{p.status === 'Publicado' ? int(p.mensagens) : '—'}</td>
                  <td className="num hide-sm">{p.investimento ? money(p.investimento) : '—'}</td>
                  <td><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    <RowMenu actions={[
                      { label: p.status === 'Publicado' ? 'Atualizar métricas' : 'Editar', onClick: () => abrir(p) },
                      { label: <><Copy size={14} /> Reaproveitar pauta</>, onClick: () => duplicar(p) },
                      { label: <><Trash2 size={14} /> Excluir</>, danger: true, onClick: () => excluir(p) },
                    ]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {s.total === 0 && <Empty text="Nenhum post encontrado." />}
      </div>
      <Pager {...s} noun="posts" />
    </>
  );
}

/* ---------------- Leads e ROI ---------------- */
function Roi({ de, ate }: { de: string; ate: string }) {
  const { db } = useStore();
  const linhas = atribuicao(db, de, ate);
  const tot = linhas.reduce((a, l) => ({ leads: a.leads + l.leads, fechados: a.fechados + l.fechados, receita: a.receita + l.receita }), { leads: 0, fechados: 0, receita: 0 });
  const sociais = linhas.filter((l) => l.social);
  const shareSocial = tot.leads ? sociais.reduce((a, l) => a + l.leads, 0) / tot.leads : 0;
  const geradores = db.posts.map((p) => {
    const ops = db.oportunidades.filter((o) => o.postId === p.id);
    return { p, n: ops.length, valor: ops.reduce((a, o) => a + o.valor, 0), fechado: ops.filter((o) => o.etapa === 'Fechados').reduce((a, o) => a + o.valor, 0) };
  }).filter((x) => x.n > 0).sort((a, b) => b.valor - a.valor);
  const semOrigem = db.oportunidades.filter((o) => !o.origem && o.criadoEm >= de).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="insight opp">
        <div className="ico tone-blue"><Megaphone size={16} /></div>
        <div className="d">
          As redes sociais trouxeram <strong>{pct(shareSocial)}</strong> dos leads do período. A origem vem do campo <strong>"Como nos conheceu"</strong> de cada oportunidade no Funil Comercial.
          {semOrigem > 0 && <> <span className="text-warning strong">{semOrigem} oportunidade(s) sem origem informada</span>: preencha para a atribuição ficar completa.</>}
        </div>
      </div>
      <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
        <table className="table">
          <thead><tr><th>Canal</th><th className="num">Leads</th><th className="num">Fechados</th><th className="num">Conversão</th><th className="num">Receita fechada</th><th className="num">Em negociação</th><th className="num">Investido</th><th className="num">Custo por lead</th><th className="num">Retorno</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.canal}>
                <td className="strong">{l.social && <i style={{ width: 8, height: 8, borderRadius: 8, background: COR_REDE[l.canal as RedeSocial], display: 'inline-block', marginRight: 6 }} />}{l.canal}</td>
                <td className="num">{l.leads}<div className="sub">{tot.leads ? pct(l.leads / tot.leads) : '0%'}</div></td>
                <td className="num">{l.fechados}</td>
                <td className="num">{pct(l.conversao)}</td>
                <td className="num strong">{money(l.receita)}</td>
                <td className="num">{money(l.pipeline)}</td>
                <td className="num">{l.investimento ? money(l.investimento) : '—'}</td>
                <td className="num">{l.cpl !== null ? money(l.cpl) : '—'}</td>
                <td className={`num strong ${l.roi !== null ? (l.roi >= 0 ? 'text-success' : 'text-danger') : ''}`}>{l.roi !== null ? `${(l.roi + 1).toFixed(1).replace('.', ',')}×` : '—'}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={9} className="empty">Sem oportunidades no período.</td></tr>}
          </tbody>
          <tfoot><tr style={{ background: 'var(--primary-50)' }}><td className="strong">Total</td><td className="num strong">{tot.leads}</td><td className="num strong">{tot.fechados}</td><td className="num strong">{pct(tot.leads ? tot.fechados / tot.leads : 0)}</td><td className="num strong">{money(tot.receita)}</td><td colSpan={4} /></tr></tfoot>
        </table>
      </div>
      <div className="small muted">Retorno = receita fechada ÷ valor investido em impulsionamento na rede. Canais sem investimento pago (orgânico, indicação) não têm custo por lead calculado.</div>

      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="card-head"><h3>Posts que geraram oportunidades</h3></div>
        <ul className="list">
          {geradores.map(({ p, n, valor, fechado }) => (
            <li key={p.id}>
              <div style={{ flex: 1, minWidth: 0 }}><div className="title">{p.titulo}</div><div className="desc">{p.rede} · {p.formato} · {date(p.data)}{p.investimento ? ` · impulsionado ${money(p.investimento)}` : ' · orgânico'}</div></div>
              <div className="right small"><strong>{n} lead(s) · {money(valor)}</strong><div className="text-success">{money(fechado)} fechado</div></div>
            </li>
          ))}
          {geradores.length === 0 && <li className="muted">Nenhuma oportunidade vinculada a post. Vincule pelo campo "Post de origem" no Funil.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- Formulários ---------------- */
function PostForm({ p, onClose, onSave }: { p: Post; onClose: () => void; onSave: (p: Post) => void }) {
  const [f, setF] = useState(p);
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setF((x) => ({ ...x, [k]: v }));
  const n = (k: keyof Post, label: string) => (
    <Field label={label}><input className="input" type="number" min={0} value={Number(f[k]) || ''} onChange={(e) => set(k, toNumber(e.target.value) as never)} /></Field>
  );
  return (
    <Modal wide title={p.titulo ? p.titulo : 'Novo post'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="post-form">Salvar</button>
    </>}>
      <form id="post-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Título / tema" full><input className="input" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} required autoFocus /></Field>
        <Field label="Rede"><select className="select" value={f.rede} onChange={(e) => set('rede', e.target.value as RedeSocial)}><Options items={REDES} /></select></Field>
        <Field label="Formato"><select className="select" value={f.formato} onChange={(e) => set('formato', e.target.value as FormatoPost)}><Options items={FORMATOS} /></select></Field>
        <Field label="Pilar de conteúdo" hint="Educativo e prova social constroem audiência; promocional converte."><select className="select" value={f.pilar} onChange={(e) => set('pilar', e.target.value as PilarConteudo)}><Options items={PILARES} /></select></Field>
        <Field label="Serviço divulgado"><select className="select" value={f.categoria ?? ''} onChange={(e) => set('categoria', (e.target.value || undefined) as CategoriaServico | undefined)}><option value="">Nenhum (institucional)</option><Options items={CATEGORIAS} /></select></Field>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} required /></Field>
        <Field label="Horário"><input className="input" type="time" value={f.hora ?? ''} onChange={(e) => set('hora', e.target.value)} /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as StatusPost)}><Options items={STATUS} /></select></Field>
        <Field label="Impulsionamento (R$)"><input className="input" inputMode="decimal" defaultValue={f.investimento ? String(f.investimento).replace('.', ',') : ''} onChange={(e) => set('investimento', toNumber(e.target.value))} /></Field>
        <Field label="Legenda / roteiro / observações" full><textarea className="textarea" value={f.legenda ?? ''} onChange={(e) => set('legenda', e.target.value)} /></Field>
        {f.status === 'Publicado' && (
          <>
            <div className="full divider" />
            <div className="full row strong"><CalendarDays size={16} color="var(--primary)" /> Métricas do post <span className="small muted" style={{ fontWeight: 400 }}>(copie do Insights/Meta Business Suite/LinkedIn)</span></div>
            {n('alcance', 'Alcance (contas)')}{n('impressoes', 'Impressões')}
            {n('curtidas', 'Curtidas')}{n('comentarios', 'Comentários')}
            {n('compartilhamentos', 'Compartilhamentos')}{n('salvamentos', 'Salvamentos')}
            {n('cliques', 'Cliques no link / perfil')}{n('mensagens', 'Mensagens / contatos')}
            <div className="full small muted">
              Engajamento: <strong>{pct(engajamento(f), 1)}</strong> · Interações: <strong>{int(interacoes(f))}</strong>
              {f.investimento > 0 && f.mensagens > 0 && <> · Custo por contato: <strong>{money(f.investimento / f.mensagens)}</strong></>}
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function SeguidoresForm({ onClose }: { onClose: () => void }) {
  const { db, upsert, toast } = useStore();
  const mes = today().slice(0, 7);
  const redes: RedeSocial[] = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok'];
  const atual = (r: RedeSocial) => db.seguidores.find((s) => s.rede === r && s.mes === mes)?.seguidores
    ?? [...db.seguidores].filter((s) => s.rede === r).sort((a, b) => b.mes.localeCompare(a.mes))[0]?.seguidores ?? 0;
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(redes.map((r) => [r, atual(r)])));
  return (
    <Modal title={`Seguidores · ${monthLabel(mes)}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={() => {
        redes.filter((r) => vals[r] > 0).forEach((r) => {
          const item: Seguidores = { id: `sg-${r}-${mes}`, rede: r, mes, seguidores: vals[r] };
          upsert('seguidores', item);
        });
        toast('Seguidores atualizados.'); onClose();
      }}>Salvar</button>
    </>}>
      <p className="small muted" style={{ marginTop: 0 }}>Registre o número de seguidores uma vez por mês (de preferência no último dia) para acompanhar o crescimento de cada rede.</p>
      <div className="form-grid">
        {redes.map((r) => (
          <Field key={r} label={r}><input className="input" type="number" min={0} value={vals[r] || ''} onChange={(e) => setVals({ ...vals, [r]: toNumber(e.target.value) })} /></Field>
        ))}
      </div>
    </Modal>
  );
}
