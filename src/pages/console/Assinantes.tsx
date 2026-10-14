import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Building2, Copy, CreditCard, ExternalLink, KeyRound, Lock, Plus } from 'lucide-react';
import { usePlataforma } from '../../store/PlataformaStore';
import { useStore } from '../../store/Store';
import type { Assinante, CicloAssinatura, FormaPagamento, Modulo, OrigemAssinante, Plano, StatusAssinatura } from '../../types';
import { Badge, Confirm, Empty, Modal, PageHeader, Pager, RowMenu, SearchInput, Th, useSortPage } from '../../components/ui';
import { Field, Options } from '../../components/fields';
import { addDays, date, dateTime, money, monthLabel, normalize, pct, today, uid } from '../../utils/format';
import { linhas, type LinhaAssinante } from '../../utils/saas';
import { cfgDe, criarBaseVazia, documentoValido, ESSENCIAIS, modulosLiberados, MODULOS_DADOS, planoDe, proximoVencimento, valorMensal, vencida } from '../../store/plataforma';
import { createSeed, MODULOS } from '../../store/seed';
import { SEGMENTOS, segmentoPorId } from '../../store/segmentos';
import { FORMAS_PAGAMENTO, nomeForma, nomeModulo, SaudeBadge, STATUS_ASSINATURA, StatusBadge } from './comum';

const ORIGENS: OrigemAssinante[] = ['Indicação', 'Instagram', 'Google', 'Parceiro contábil', 'Evento', 'Site', 'Outros'];
const MOTIVOS = ['Preço alto para o uso', 'Baixa adoção / não implantou', 'Faltou funcionalidade', 'Encerrou as atividades', 'Migrou para concorrente', 'Problemas de suporte', 'Outros'];

export default function ConsoleAssinantes() {
  const { dados, uso, salvar, redefinirSenha, excluirEmpresa, asaas } = usePlataforma();
  const { toast } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [plano, setPlano] = useState('');
  const [saude, setSaude] = useState(params.get('saude') ?? '');
  const [limite, setLimite] = useState(params.get('filtro') === 'limite');
  const [novo, setNovo] = useState(params.get('novo') === '1');
  const [editando, setEditando] = useState<Assinante | null>(null);
  const [trocando, setTrocando] = useState<LinhaAssinante | null>(null);
  const [cancelando, setCancelando] = useState<LinhaAssinante | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<LinhaAssinante | null>(null);
  const [credencial, setCredencial] = useState<{ empresa: string; email: string; senha: string } | null>(null);
  const [cobrando, setCobrando] = useState<LinhaAssinante | null>(null);
  const [parando, setParando] = useState<LinhaAssinante | null>(null);
  const hoje = today();

  useEffect(() => { if (params.get('novo')) { params.delete('novo'); setParams(params, { replace: true }); } }, [params, setParams]);

  const rows = useMemo(() => linhas(dados, uso), [dados, uso]);
  const filtradas = rows.filter((r) => (!status || r.status === status) && (!plano || r.planoId === plano) && (!saude || r.saude.nivel === saude)
    && (!limite || r.usoT.usuarios >= r.maxUsuarios) && (!q || normalize(`${r.empresa} ${r.segmento} ${r.cidade} ${r.responsavel} ${r.email}`).includes(normalize(q))));
  const tab = filtradas.map((r) => ({ ...r, score: r.saude.score, acesso: r.usoT.ultimoAcesso ?? '' }));
  const s = useSortPage(tab, 12, { key: 'mrr', dir: 'desc' });
  const cont = (st: StatusAssinatura) => rows.filter((r) => r.status === st).length;

  const evento = (a: Assinante, tipo: string, detalhe: string): Assinante['historico'] => [...a.historico, { data: hoje, tipo, detalhe }];
  const base = (r: LinhaAssinante): Assinante => {
    const { plano: _p, mrr: _m, valor: _v, usoT: _u, saude: _s, maxUsuarios: _x, ocupacao: _o, emAberto: _e, vencido: _ve, diasTrial: _d, modulos: _mo, ...a } = r;
    return a;
  };
  const mudarStatus = (r: LinhaAssinante, st: StatusAssinatura, tipo: string, det: string, extra: Partial<Assinante> = {}) => {
    const a = base(r);
    salvar('assinantes', { ...a, ...extra, status: st, historico: evento(a, tipo, det) });
    toast(`${r.empresa}: ${tipo.toLowerCase()}.`);
  };
  const gerarSenha = async (r: LinhaAssinante) => {
    const res = await redefinirSenha(r.id);
    if (res.erro) return toast(res.erro, 'error');
    setCredencial({ empresa: r.empresa, email: res.email ?? r.email, senha: res.senha! });
  };

  const sel = detalhe ? rows.find((r) => r.id === detalhe) ?? null : null;

  return (
    <>
      <PageHeader title="Empresas assinantes" subtitle="Quem usa o Pivot Hub, em qual plano, quanto paga e como está a saúde de cada conta.">
        <button className="btn btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Nova empresa</button>
      </PageHeader>

      <div className="seg" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={!status ? 'active' : ''} onClick={() => setStatus('')}>Todas ({rows.length})</button>
        {STATUS_ASSINATURA.map((st) => (
          <button key={st} className={status === st ? 'active' : ''} onClick={() => setStatus(st)}>{st === 'Trial' ? 'Teste grátis' : st} ({cont(st)})</button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar empresa, segmento, cidade ou responsável..." />
          <select className="select" value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="">Todos os planos</option>
            {dados.planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select className="select" value={saude} onChange={(e) => setSaude(e.target.value)}>
            <option value="">Toda saúde</option><Options items={['Saudável', 'Atenção', 'Risco'] as const} />
          </select>
          <label className="check small"><input type="checkbox" checked={limite} onChange={(e) => setLimite(e.target.checked)} /> No limite de usuários</label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Empresa" k="empresa" s={s} />
                <Th label="Plano" k="plano" s={s} />
                <Th label="Mensalidade" k="mrr" s={s} className="num" />
                <Th label="Status" k="status" s={s} />
                <Th label="Usuários" k="ocupacao" s={s} className="hide-sm" />
                <Th label="Último acesso" k="acesso" s={s} className="hide-sm" />
                <Th label="Saúde" k="score" s={s} />
                <th className="right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.view.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetalhe(r.id)}>
                  <td>
                    <div className="strong">{r.empresa}</div>
                    <div className="sub">{r.segmento} · {r.cidade}{!r.provisionado && ' · demonstração'}</div>
                  </td>
                  <td>{r.plano}<div className="sub">{r.ciclo === 'Anual' ? 'Anual (fidelidade)' : 'Mensal'}{r.modulosExtras.length ? ` · +${r.modulosExtras.length} módulo(s)` : ''}</div></td>
                  <td className="num strong">{money(r.valor)}<div className="sub">{r.cobranca?.ativa ? <span className={r.cobranca.erro ? 'text-danger' : 'text-success'} title={r.cobranca.erro}>Asaas · {nomeForma(r.cobranca.forma)}{r.cobranca.erro ? ' (erro)' : ''}</span> : r.descontoPct ? `${pct(r.descontoPct)} desc.` : r.mrr ? '' : 'fora do MRR'}</div></td>
                  <td>
                    <StatusBadge s={r.status} />
                    {r.diasTrial !== null && <div className={`sub ${r.diasTrial <= 3 ? 'text-danger' : ''}`}>{r.diasTrial < 0 ? 'teste expirado' : `${r.diasTrial} dia(s) restantes`}</div>}
                    {r.vencido > 0 && <div className="sub text-danger">{money(r.vencido)} vencido</div>}
                  </td>
                  <td className="hide-sm" style={{ minWidth: 110 }}>
                    <span className={r.ocupacao >= 1 ? 'text-warning strong' : ''}>{r.usoT.usuarios}/{r.maxUsuarios}</span>
                    <div className="meter"><span style={{ width: `${Math.min(100, r.ocupacao * 100)}%`, background: r.ocupacao >= 1 ? 'var(--warning)' : undefined }} /></div>
                  </td>
                  <td className="hide-sm nowrap">{r.usoT.ultimoAcesso ? dateTime(r.usoT.ultimoAcesso) : 'Nunca'}<div className="sub">adoção {pct(r.saude.adocao)}</div></td>
                  <td><SaudeBadge s={r.saude} /></td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    <RowMenu actions={[
                      { label: 'Ver detalhes', onClick: () => setDetalhe(r.id) },
                      { label: 'Editar cadastro e assinatura', onClick: () => setEditando(base(r)) },
                      { label: 'Alterar plano', onClick: () => setTrocando(r), hidden: r.status === 'Cancelada' },
                      { label: 'Gerar nova senha do responsável', onClick: () => gerarSenha(r), hidden: !r.provisionado },
                      { label: 'Ativar cobrança automática (Asaas)', onClick: () => setCobrando(r), hidden: !asaas.disponivel || !!r.cobranca?.ativa || r.status === 'Cancelada' },
                      { label: 'Desativar cobrança automática', onClick: () => setParando(r), hidden: !r.cobranca?.ativa },
                      { label: 'Converter teste em assinatura', onClick: () => mudarStatus(r, 'Ativa', 'Conversão', 'Teste convertido em assinatura paga', { convertidoEm: hoje }), hidden: r.status !== 'Trial' },
                      { label: 'Estender teste por 7 dias', onClick: () => mudarStatus(r, 'Trial', 'Teste estendido', `Novo fim: ${date(addDays(r.trialFim && r.trialFim > hoje ? r.trialFim : hoje, 7))}`, { trialFim: addDays(r.trialFim && r.trialFim > hoje ? r.trialFim : hoje, 7) }), hidden: r.status !== 'Trial' },
                      { label: 'Marcar como inadimplente', onClick: () => mudarStatus(r, 'Inadimplente', 'Inadimplência', `${money(r.vencido)} vencidos`), hidden: r.status !== 'Ativa' },
                      { label: 'Regularizar (voltar a Ativa)', onClick: () => mudarStatus(r, 'Ativa', 'Regularização', 'Pagamento regularizado'), hidden: r.status !== 'Inadimplente' },
                      { label: 'Suspender acesso', onClick: () => mudarStatus(r, 'Suspensa', 'Suspensão', r.vencido ? `${money(r.vencido)} vencidos` : 'Suspensão manual'), hidden: !['Ativa', 'Inadimplente', 'Trial'].includes(r.status) },
                      { label: 'Reativar acesso', onClick: () => mudarStatus(r, 'Ativa', 'Reativação', 'Acesso reativado', { canceladoEm: undefined, motivoCancelamento: undefined }), hidden: !['Suspensa', 'Cancelada'].includes(r.status) },
                      { label: 'Cancelar assinatura', onClick: () => setCancelando(r), hidden: r.status === 'Cancelada' },
                      { label: 'Excluir empresa e dados', danger: true, onClick: () => setExcluindo(r) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhuma empresa encontrada com estes filtros." />}
        </div>
        <Pager {...s} noun="empresas" />
      </div>

      {novo && <NovaEmpresa onClose={() => setNovo(false)} onCriada={(c) => { setNovo(false); setCredencial(c); }} />}
      {editando && <EditarAssinante a={editando} onClose={() => setEditando(null)} />}
      {trocando && <TrocarPlano r={trocando} onClose={() => setTrocando(null)} onConfirm={(p) => {
        const a = base(trocando);
        const atual = planoDe(dados, a.planoId);
        const up = (p.ordem ?? 0) > (atual?.ordem ?? 0);
        salvar('assinantes', { ...a, planoId: p.id, historico: evento(a, up ? 'Upgrade' : 'Downgrade', `${atual?.nome ?? '—'} → ${p.nome}`) });
        toast(`${a.empresa} agora está no plano ${p.nome}. Os módulos já foram ${up ? 'liberados' : 'ajustados'}.`);
        setTrocando(null);
      }} />}
      {cancelando && <Cancelar r={cancelando} onClose={() => setCancelando(null)} onConfirm={(motivo) => {
        mudarStatus(cancelando, 'Cancelada', 'Cancelamento', motivo, { canceladoEm: hoje, motivoCancelamento: motivo, valorNoCancelamento: cancelando.mrr });
        setCancelando(null);
      }} />}
      {excluindo && <Confirm label="Excluir definitivamente" text={<>Excluir <strong>{excluindo.empresa}</strong>, a base de dados dela e todas as faturas? Esta ação não pode ser desfeita. Para manter o histórico de churn, prefira <strong>Cancelar assinatura</strong>.</>}
        onClose={() => setExcluindo(null)} onConfirm={async () => { const e = await excluirEmpresa(excluindo.id); toast(e ?? 'Empresa excluída.', e ? 'error' : 'success'); }} />}
      {sel && <Detalhe r={sel} onClose={() => setDetalhe(null)} onEditar={() => { setDetalhe(null); setEditando(base(sel)); }} onSenha={() => gerarSenha(sel)}
        onCobrar={() => { setDetalhe(null); setCobrando(sel); }} onParar={() => { setDetalhe(null); setParando(sel); }} />}
      {credencial && <Credencial c={credencial} onClose={() => setCredencial(null)} />}
      {cobrando && <AtivarCobranca r={cobrando} onClose={() => setCobrando(null)} />}
      {parando && <Confirm label="Desativar cobrança" text={<>Encerrar a assinatura de <strong>{parando.empresa}</strong> no Asaas? As cobranças futuras são canceladas; as vencidas continuam em aberto.</>}
        onClose={() => setParando(null)} onConfirm={async () => { const e = await asaas.desativar(parando.id); toast(e ?? 'Cobrança automática desativada.', e ? 'error' : 'success'); }} />}
    </>
  );
}

/* ---------------- Resumo de valor (usado no cadastro) ---------------- */
function ResumoValor({ a, plano }: { a: Pick<Assinante, 'ciclo' | 'usuariosExtras' | 'modulosExtras' | 'descontoPct'>; plano?: Plano }) {
  const { dados } = usePlataforma();
  const cfg = cfgDe(dados);
  if (!plano) return null;
  const base = plano.precoMensal * (a.ciclo === 'Anual' ? 1 - plano.descontoAnual : 1);
  const extrasU = a.usuariosExtras * plano.precoUsuarioExtra;
  const extrasM = a.modulosExtras.filter((m) => !plano.modulos.includes(m)).length * cfg.precoModuloAvulso;
  const total = valorMensal(a, plano, cfg);
  return (
    <div className="demo-box" style={{ display: 'grid', gap: 6 }}>
      <div className="row between small"><span>Plano {plano.nome}{a.ciclo === 'Anual' ? ` (−${pct(plano.descontoAnual)} fidelidade)` : ''}</span><strong>{money(base)}</strong></div>
      {extrasU > 0 && <div className="row between small"><span>{a.usuariosExtras} usuário(s) extra(s)</span><strong>{money(extrasU)}</strong></div>}
      {extrasM > 0 && <div className="row between small"><span>Módulos avulsos</span><strong>{money(extrasM)}</strong></div>}
      {a.descontoPct > 0 && <div className="row between small"><span>Desconto negociado ({pct(a.descontoPct)})</span><strong className="text-danger">−{money((base + extrasU + extrasM) - total)}</strong></div>}
      <div className="row between"><strong>Mensalidade</strong><strong style={{ fontSize: 18 }}>{money(total)}</strong></div>
      <div className="small muted">{plano.maxUsuarios + a.usuariosExtras} usuário(s) · {new Set([...ESSENCIAIS, ...plano.modulos, ...a.modulosExtras]).size} módulo(s) liberado(s) · {money(total * 12)}/ano</div>
    </div>
  );
}

function CamposAssinatura({ f, set }: { f: Assinante; set: <K extends keyof Assinante>(k: K, v: Assinante[K]) => void }) {
  const { dados } = usePlataforma();
  const plano = planoDe(dados, f.planoId);
  const avulsos = MODULOS.filter((m) => !plano?.modulos.includes(m.id) && !ESSENCIAIS.includes(m.id));
  return (
    <>
      <Field label="Plano">
        <select className="select" value={f.planoId} onChange={(e) => set('planoId', e.target.value)}>
          {[...dados.planos].sort((a, b) => a.ordem - b.ordem).map((p) => <option key={p.id} value={p.id}>{p.nome} · {money(p.precoMensal)}/mês{p.ativo ? '' : ' (inativo)'}</option>)}
        </select>
      </Field>
      <Field label="Ciclo" hint="Anual = fidelidade de 12 meses com desconto, cobrada mensalmente">
        <select className="select" value={f.ciclo} onChange={(e) => set('ciclo', e.target.value as CicloAssinatura)}><Options items={['Mensal', 'Anual'] as const} /></select>
      </Field>
      <Field label="Usuários extras"><input className="input" type="number" min={0} value={f.usuariosExtras} onChange={(e) => set('usuariosExtras', Math.max(0, Number(e.target.value)))} /></Field>
      <Field label="Desconto negociado (%)"><input className="input" type="number" min={0} max={100} value={Math.round(f.descontoPct * 100)} onChange={(e) => set('descontoPct', Math.min(100, Math.max(0, Number(e.target.value))) / 100)} /></Field>
      <Field label="Dia de vencimento"><input className="input" type="number" min={1} max={28} value={f.diaVencimento} onChange={(e) => set('diaVencimento', Math.min(28, Math.max(1, Number(e.target.value))))} /></Field>
      <Field label="Origem (canal de aquisição)"><select className="select" value={f.origem} onChange={(e) => set('origem', e.target.value as OrigemAssinante)}><Options items={ORIGENS} /></select></Field>
      {avulsos.length > 0 && (
        <Field label={`Módulos avulsos (${money(cfgDe(dados).precoModuloAvulso)}/mês cada)`} full>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            {avulsos.map((m) => (
              <label key={m.id} className="check small">
                <input type="checkbox" checked={f.modulosExtras.includes(m.id)} onChange={(e) => set('modulosExtras', e.target.checked ? [...f.modulosExtras, m.id] : f.modulosExtras.filter((x) => x !== m.id))} />
                {m.label}
              </label>
            ))}
          </div>
        </Field>
      )}
    </>
  );
}

/* ---------------- Nova empresa ---------------- */
function NovaEmpresa({ onClose, onCriada }: { onClose: () => void; onCriada: (c: { empresa: string; email: string; senha: string }) => void }) {
  const { dados, criarEmpresa, asaas } = usePlataforma();
  const { toast } = useStore();
  const hoje = today();
  const cfg = cfgDe(dados);
  const [inicioTipo, setInicioTipo] = useState<'Trial' | 'Ativa'>('Trial');
  const [baseTipo, setBaseTipo] = useState<'segmento' | 'vazia' | 'exemplo'>('segmento');
  const [segId, setSegId] = useState('generico');
  const seg = segmentoPorId(segId);
  const [salvando, setSalvando] = useState(false);
  const [cobrar, setCobrar] = useState(false);
  const [forma, setForma] = useState<FormaPagamento>('UNDEFINED');
  const [f, setF] = useState<Assinante>({
    id: uid(), empresa: '', cnpj: '', segmento: SEGMENTOS[0].nome, cidade: '', responsavel: '', email: '', telefone: '', origem: 'Indicação',
    planoId: dados.planos.find((p) => p.destaque)?.id ?? dados.planos[0]?.id ?? '', ciclo: 'Mensal', status: 'Trial', inicio: hoje,
    diaVencimento: 10, usuariosExtras: 0, modulosExtras: [], descontoPct: 0, provisionado: true, historico: [],
  });
  const set = <K extends keyof Assinante>(k: K, v: Assinante[K]) => setF((x) => ({ ...x, [k]: v }));
  const plano = planoDe(dados, f.planoId);

  const salvar = async () => {
    if (!f.empresa.trim() || !f.responsavel.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) return toast('Informe empresa, responsável e um e-mail válido.', 'error');
    if (!plano) return toast('Escolha um plano.', 'error');
    if (cobrar && !documentoValido(f.cnpj)) return toast('Para a cobrança automática, informe um CPF ou CNPJ válido.', 'error');
    setSalvando(true);
    const trial = inicioTipo === 'Trial';
    const a: Assinante = {
      ...f, email: f.email.trim().toLowerCase(), status: trial ? 'Trial' : 'Ativa', trialFim: trial ? addDays(hoje, cfg.diasTrial) : undefined,
      fimFidelidade: f.ciclo === 'Anual' ? addDays(hoje, 365) : undefined,
      historico: [{ data: hoje, tipo: trial ? 'Teste grátis' : 'Contratação', detalhe: `${trial ? `Teste de ${cfg.diasTrial} dias` : 'Assinatura'} no plano ${plano.nome} · ${f.ciclo}` }],
    };
    // a base nasce com as pré-definições do segmento (categorias, catálogo e estoque); a demonstração é a base de exemplo de tecnologia
    const vazia = criarBaseVazia(a, baseTipo === 'exemplo' ? 'tecnologia' : segId, baseTipo === 'segmento');
    const db = baseTipo === 'exemplo' ? { ...createSeed(), usuarios: vazia.usuarios, permissoes: vazia.permissoes, empresa: vazia.empresa } : vazia;
    const r = await criarEmpresa(a, db);
    if (r.erro) { setSalvando(false); return toast(r.erro, 'error'); }
    if (cobrar) {
      const e = await asaas.ativar(a.id, forma);
      toast(e ? `Empresa criada, mas a cobrança automática não foi ativada: ${e}` : 'Empresa criada e assinatura mensal criada no Asaas.', e ? 'error' : 'success');
    }
    setSalvando(false);
    onCriada({ empresa: a.empresa, email: a.email, senha: r.senha! });
  };

  return (
    <Modal wide title={<span className="row"><Building2 size={18} /> Nova empresa assinante</span>} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Criando…' : 'Criar empresa e gerar acesso'}</button>
    </>}>
      <div className="grid g-3-2" style={{ alignItems: 'start' }}>
        <div className="form-grid">
          <Field label="Empresa" full><input className="input" value={f.empresa} onChange={(e) => set('empresa', e.target.value)} placeholder="Nome fantasia" autoFocus /></Field>
          <Field label="CNPJ / CPF"><input className="input" value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
          <Field label="Segmento" hint={seg.exemplos}>
            <select className="select" value={segId} onChange={(e) => { setSegId(e.target.value); set('segmento', segmentoPorId(e.target.value).nome); }}>
              {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Field>
          <Field label="Atividade (descrição)"><input className="input" value={f.segmento} onChange={(e) => set('segmento', e.target.value)} placeholder="Ex.: Oficina mecânica, clínica odontológica" /></Field>
          <Field label="Responsável (proprietário)"><input className="input" value={f.responsavel} onChange={(e) => set('responsavel', e.target.value)} /></Field>
          <Field label="E-mail de login do responsável"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Telefone"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
          <Field label="Cidade/UF"><input className="input" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} placeholder="Vitória/ES" /></Field>
          <div className="divider" style={{ gridColumn: '1 / -1' }} />
          <CamposAssinatura f={f} set={set} />
          <Field label="Como começa">
            <div className="seg">
              <button type="button" className={inicioTipo === 'Trial' ? 'active' : ''} onClick={() => setInicioTipo('Trial')}>Teste grátis ({cfg.diasTrial} dias)</button>
              <button type="button" className={inicioTipo === 'Ativa' ? 'active' : ''} onClick={() => setInicioTipo('Ativa')}>Assinatura paga</button>
            </div>
          </Field>
          <Field label="Cobrança" full hint={asaas.disponivel ? `1º vencimento: ${date(proximoVencimento({ status: inicioTipo, trialFim: inicioTipo === 'Trial' ? addDays(hoje, cfg.diasTrial) : undefined, diaVencimento: f.diaVencimento }))}${inicioTipo === 'Trial' ? ' (após o teste grátis)' : ''}` : 'Disponível na versão publicada no Cloudflare com o Asaas configurado.'}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <label className="check"><input type="checkbox" disabled={!asaas.disponivel} checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} /> Cobrar automaticamente pelo Asaas</label>
              {cobrar && <select className="select" style={{ maxWidth: 300 }} value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>{FORMAS_PAGAMENTO.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>}
            </div>
          </Field>
          <Field label="Base inicial">
            <div className="seg">
              <button type="button" className={baseTipo === 'segmento' ? 'active' : ''} onClick={() => setBaseTipo('segmento')}>Pré-configurada</button>
              <button type="button" className={baseTipo === 'vazia' ? 'active' : ''} onClick={() => setBaseTipo('vazia')}>Vazia</button>
              <button type="button" className={baseTipo === 'exemplo' ? 'active' : ''} onClick={() => setBaseTipo('exemplo')}>Demonstração</button>
            </div>
          </Field>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <ResumoValor a={f} plano={plano} />
          <div className="small" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 4 }}>
            <div className="strong">{baseTipo === 'exemplo' ? 'Demonstração: base de exemplo (empresa de tecnologia)' : `Pré-definições: ${seg.nome}`}</div>
            {baseTipo !== 'exemplo' && <>
              <div>Telas: <strong>{seg.rotulos.ativos}</strong> · <strong>Estoque de {seg.rotulos.materiais}</strong> · <strong>{seg.rotulos.turmas}</strong> · responsável: <strong>{seg.rotulos.profissional}</strong></div>
              <div>Categorias: {seg.categoriasServico.join(', ')}</div>
              <div className="muted">{baseTipo === 'segmento' ? `${seg.servicos.length} serviços com preço sugerido e ${seg.materiais.length} itens de estoque (zerados) já cadastrados.` : 'Categorias e nomes do segmento, sem catálogo cadastrado.'} A empresa ajusta tudo em Configurações.</div>
            </>}
          </div>
          {plano && (
            <div className="small">
              <div className="strong" style={{ marginBottom: 6 }}>Módulos liberados</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {MODULOS.map((m) => {
                  const ok = modulosLiberados(f, plano).includes(m.id);
                  return <Badge key={m.id} tone={ok ? 'blue' : 'gray'}>{ok ? '' : '🔒 '}{m.label}</Badge>;
                })}
              </div>
            </div>
          )}
          <div className="small muted">O responsável entra como <strong>Proprietário</strong> com uma senha provisória gerada agora. Ele cadastra a equipe em Usuários, dentro do limite do plano.</div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Credenciais geradas ---------------- */
function Credencial({ c, onClose }: { c: { empresa: string; email: string; senha: string }; onClose: () => void }) {
  const { modo, toast } = useStore();
  const url = `${location.origin}${location.pathname}`;
  const texto = `Acesso ao Pivot Hub — ${c.empresa}\nEndereço: ${url}\nE-mail: ${c.email}\nSenha provisória: ${c.senha}\nTroque a senha em Configurações no primeiro acesso.`;
  return (
    <Modal title={<span className="row"><KeyRound size={18} /> Acesso de {c.empresa}</span>} onClose={onClose} footer={<>
      <button className="btn" onClick={() => { navigator.clipboard?.writeText(texto).then(() => toast('Dados de acesso copiados.')).catch(() => toast('Copie manualmente.', 'error')); }}><Copy size={15} /> Copiar mensagem</button>
      <button className="btn btn-primary" onClick={onClose}>Concluir</button>
    </>}>
      <dl className="dl">
        <dt>Endereço</dt><dd>{url}</dd>
        <dt>E-mail</dt><dd className="strong">{c.email}</dd>
        <dt>Senha provisória</dt><dd><code style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{c.senha}</code></dd>
      </dl>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {modo === 'remote'
          ? 'A senha é exibida só agora e fica guardada apenas como hash no banco. Envie ao cliente por um canal privado e peça a troca no primeiro acesso.'
          : 'Modo local (sem banco): todas as contas usam a senha de demonstração 123456.'}
      </p>
    </Modal>
  );
}

/* ---------------- Editar cadastro e assinatura ---------------- */
function EditarAssinante({ a, onClose }: { a: Assinante; onClose: () => void }) {
  const { dados, salvar } = usePlataforma();
  const { toast } = useStore();
  const [f, setF] = useState(a);
  const set = <K extends keyof Assinante>(k: K, v: Assinante[K]) => setF((x) => ({ ...x, [k]: v }));
  const plano = planoDe(dados, f.planoId);
  const ok = () => {
    if (!f.empresa.trim()) return toast('Informe o nome da empresa.', 'error');
    const hist = [...f.historico];
    const hoje = today();
    if (f.planoId !== a.planoId) {
      const ant = planoDe(dados, a.planoId);
      hist.push({ data: hoje, tipo: (plano?.ordem ?? 0) > (ant?.ordem ?? 0) ? 'Upgrade' : 'Downgrade', detalhe: `${ant?.nome ?? '—'} → ${plano?.nome ?? '—'}` });
    }
    if (f.status !== a.status) hist.push({ data: hoje, tipo: 'Status', detalhe: `${a.status} → ${f.status}` });
    const va = valorMensal(a, planoDe(dados, a.planoId), cfgDe(dados)), vb = valorMensal(f, plano, cfgDe(dados));
    if (f.planoId === a.planoId && Math.abs(va - vb) > 0.004) hist.push({ data: hoje, tipo: vb > va ? 'Expansão' : 'Ajuste', detalhe: `Mensalidade ${money(va)} → ${money(vb)}` });
    salvar('assinantes', { ...f, historico: hist });
    toast('Assinatura atualizada.');
    onClose();
  };
  return (
    <Modal wide title={`Editar · ${a.empresa}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={ok}>Salvar</button>
    </>}>
      <div className="grid g-3-2" style={{ alignItems: 'start' }}>
        <div className="form-grid">
          <Field label="Empresa" full><input className="input" value={f.empresa} onChange={(e) => set('empresa', e.target.value)} /></Field>
          <Field label="CNPJ / CPF"><input className="input" value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
          <Field label="Segmento"><input className="input" value={f.segmento} onChange={(e) => set('segmento', e.target.value)} /></Field>
          <Field label="Responsável"><input className="input" value={f.responsavel} onChange={(e) => set('responsavel', e.target.value)} /></Field>
          <Field label="E-mail de contato" hint={a.provisionado ? 'O login do responsável é alterado pela própria empresa em Usuários' : undefined}><input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Telefone"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
          <Field label="Cidade/UF"><input className="input" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
          <div className="divider" style={{ gridColumn: '1 / -1' }} />
          <CamposAssinatura f={f} set={set} />
          <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as StatusAssinatura)}><Options items={STATUS_ASSINATURA} /></select></Field>
          {f.status === 'Trial' && <Field label="Fim do teste"><input className="input" type="date" value={f.trialFim ?? ''} onChange={(e) => set('trialFim', e.target.value)} /></Field>}
          <Field label="Observações" full><textarea className="textarea" rows={2} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Field>
        </div>
        <ResumoValor a={f} plano={plano} />
      </div>
    </Modal>
  );
}

/* ---------------- Alterar plano (com impacto) ---------------- */
function TrocarPlano({ r, onClose, onConfirm }: { r: LinhaAssinante; onClose: () => void; onConfirm: (p: Plano) => void }) {
  const { dados } = usePlataforma();
  const cfg = cfgDe(dados);
  const [alvo, setAlvo] = useState(r.planoId);
  const atual = planoDe(dados, r.planoId);
  const novo = planoDe(dados, alvo);
  const libA = modulosLiberados(r, atual), libN = novo ? modulosLiberados(r, novo) : [];
  const ganha = libN.filter((m) => !libA.includes(m)), perde = libA.filter((m) => !libN.includes(m));
  const usados = perde.filter((m) => r.usoT.modulosEmUso.includes(m));
  const delta = novo ? valorMensal(r, novo, cfg) - valorMensal(r, atual, cfg) : 0;
  const maxN = (novo?.maxUsuarios ?? 0) + r.usuariosExtras;
  return (
    <Modal title={`Alterar plano · ${r.empresa}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" disabled={!novo || alvo === r.planoId} onClick={() => novo && onConfirm(novo)}>Confirmar troca</button>
    </>}>
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {[...dados.planos].filter((p) => p.ativo || p.id === r.planoId).sort((a, b) => a.ordem - b.ordem).map((p) => (
          <label key={p.id} className="row between" style={{ border: `1px solid ${alvo === p.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
            <span className="row"><input type="radio" checked={alvo === p.id} onChange={() => setAlvo(p.id)} /> <strong>{p.nome}</strong>{p.id === r.planoId && <Badge tone="gray">atual</Badge>}</span>
            <span>{money(valorMensal(r, p, cfg))}/mês</span>
          </label>
        ))}
      </div>
      {novo && alvo !== r.planoId && (
        <div className={`insight ${delta >= 0 ? 'good' : 'warn'}`}>
          <div className={`ico tone-${delta >= 0 ? 'green' : 'orange'}`}>{delta >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</div>
          <div>
            <div className="t">{delta >= 0 ? 'Upgrade' : 'Downgrade'}: {delta >= 0 ? '+' : '−'}{money(Math.abs(delta))}/mês no MRR ({delta >= 0 ? '+' : '−'}{money(Math.abs(delta * 12))}/ano)</div>
            {ganha.length > 0 && <div className="d">Libera: {ganha.map(nomeModulo).join(', ')}.</div>}
            {perde.length > 0 && <div className="d">Bloqueia: {perde.map(nomeModulo).join(', ')}.{usados.length > 0 && <strong className="text-danger"> A empresa usa {usados.map(nomeModulo).join(', ')}: os dados ficam guardados, mas sem acesso.</strong>}</div>}
            {r.usoT.usuarios > maxN && <div className="d text-danger strong">A empresa tem {r.usoT.usuarios} usuários ativos e o plano permite {maxN}: novos acessos ficam bloqueados até ajustar.</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Cancelar({ r, onClose, onConfirm }: { r: LinhaAssinante; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [obs, setObs] = useState('');
  return (
    <Modal title={`Cancelar assinatura · ${r.empresa}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Voltar</button>
      <button className="btn btn-danger" onClick={() => onConfirm(obs ? `${motivo} — ${obs}` : motivo)}>Cancelar assinatura</button>
    </>}>
      <p style={{ marginTop: 0 }}>Saem <strong>{money(r.mrr)}/mês</strong> do MRR. O acesso é bloqueado e os dados ficam guardados para uma eventual reativação.</p>
      <Field label="Motivo principal (alimenta a análise de churn)"><select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value)}><Options items={MOTIVOS} /></select></Field>
      <Field label="Detalhes"><textarea className="textarea" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="O que o cliente disse? Há chance de retorno?" /></Field>
    </Modal>
  );
}

/* ---------------- Detalhe da conta ---------------- */
function Detalhe({ r, onClose, onEditar, onSenha, onCobrar, onParar }: { r: LinhaAssinante; onClose: () => void; onEditar: () => void; onSenha: () => void; onCobrar: () => void; onParar: () => void }) {
  const { dados, asaas } = usePlataforma();
  const plano = planoDe(dados, r.planoId);
  const lib = modulosLiberados(r, plano);
  const fats = dados.faturas.filter((f) => f.assinanteId === r.id).sort((a, b) => b.competencia.localeCompare(a.competencia));
  const pagas = fats.filter((f) => f.status === 'Paga');
  const naoUsados = lib.filter((m) => MODULOS_DADOS.includes(m) && !r.usoT.modulosEmUso.includes(m));
  return (
    <Modal wide title={<span className="row">{r.empresa} <StatusBadge s={r.status} /></span>} onClose={onClose} footer={<>
      {r.provisionado && <button className="btn" onClick={onSenha}><KeyRound size={15} /> Gerar nova senha</button>}
      <button className="btn btn-primary" onClick={onEditar}>Editar</button>
    </>}>
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <dl className="dl">
            <dt>Segmento</dt><dd>{r.segmento || '—'} · {r.cidade || '—'}</dd>
            <dt>Responsável</dt><dd>{r.responsavel} · {r.email} · {r.telefone || '—'}</dd>
            <dt>CNPJ</dt><dd>{r.cnpj || '—'}</dd>
            <dt>Cliente desde</dt><dd>{date(r.inicio)} · via {r.origem}</dd>
            <dt>Plano</dt><dd>{r.plano} · {r.ciclo}{r.fimFidelidade ? ` (fidelidade até ${date(r.fimFidelidade)})` : ''}</dd>
            <dt>Mensalidade</dt><dd className="strong">{money(r.valor)} · vence dia {r.diaVencimento}</dd>
            {r.trialFim && <><dt>Teste grátis</dt><dd>até {date(r.trialFim)}{r.convertidoEm ? ` · convertido em ${date(r.convertidoEm)}` : ''}</dd></>}
            {r.canceladoEm && <><dt>Cancelada em</dt><dd>{date(r.canceladoEm)} · {r.motivoCancelamento}</dd></>}
            <dt>Receita total</dt><dd>{money(pagas.reduce((s, f) => s + f.valor, 0))} em {pagas.length} fatura(s) paga(s)</dd>
          </dl>
          <div>
            <div className="row between" style={{ marginBottom: 6 }}><strong>Saúde da conta</strong><SaudeBadge s={r.saude} /></div>
            <div className="small muted">
              Último acesso: {r.usoT.ultimoAcesso ? dateTime(r.usoT.ultimoAcesso) : 'nunca'} · {r.usoT.usuarios}/{r.maxUsuarios} usuário(s) · {r.usoT.registros} registro(s) · adoção de {pct(r.saude.adocao)} dos módulos{!r.usoT.real && ' (uso simulado)'}
            </div>
            {naoUsados.length > 0 && <div className="small" style={{ marginTop: 6 }}><strong>Módulos contratados sem uso:</strong> {naoUsados.map(nomeModulo).join(', ')} — oportunidade de treinamento.</div>}
          </div>
          <div>
            <strong className="small">Módulos</strong>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {MODULOS.map((m) => {
                const ok = lib.includes(m.id as Modulo);
                return <Badge key={m.id} tone={!ok ? 'gray' : r.usoT.modulosEmUso.includes(m.id) ? 'green' : 'blue'}>{!ok && <Lock size={10} />}{m.label}</Badge>;
              })}
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>Verde: em uso · Azul: liberado sem uso · Cinza: fora do plano</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <strong className="small">Faturas</strong>
            <table className="table table-compact" style={{ marginTop: 6 }}>
              <tbody>
                {fats.slice(0, 6).map((f) => (
                  <tr key={f.id}>
                    <td>{monthLabel(f.competencia)}</td>
                    <td className="num">{money(f.valor)}</td>
                    <td className="right">{f.link && <a className="btn btn-ghost btn-icon btn-sm" href={f.link} target="_blank" rel="noreferrer" title="Abrir fatura no Asaas"><ExternalLink size={13} /></a>}{f.status === 'Paga' ? <Badge tone="green">Paga</Badge> : f.status === 'Cancelada' ? <Badge tone="gray">Cancelada</Badge> : vencida(f) ? <Badge tone="red">Vencida</Badge> : <Badge tone="blue">Em aberto</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fats.length && <div className="small muted">Nenhuma fatura emitida.</div>}
          </div>
          <div>
            <strong className="small">Histórico</strong>
            <ul className="list" style={{ marginTop: 6 }}>
              {[...r.historico].reverse().map((h, i) => (
                <li key={i} style={{ alignItems: 'flex-start' }}>
                  <span className="small muted nowrap" style={{ minWidth: 76 }}>{date(h.data)}</span>
                  <span className="small"><strong>{h.tipo}</strong> · {h.detalhe}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="demo-box" style={{ display: 'grid', gap: 6 }}>
            <div className="row between"><strong className="row"><CreditCard size={14} /> Cobrança automática (Asaas)</strong>
              {r.cobranca?.ativa ? <Badge tone={r.cobranca.erro ? 'red' : 'green'}>{r.cobranca.erro ? 'Com erro' : 'Ativa'}</Badge> : <Badge tone="gray">Manual</Badge>}</div>
            {r.cobranca?.ativa ? (
              <>
                <div className="small">{money(r.cobranca.valor ?? r.valor)}/mês · {nomeForma(r.cobranca.forma)} · 1º vencimento {date(r.cobranca.proximoVencimento)}</div>
                <div className="small muted">Assinatura {r.cobranca.assinaturaId} · cliente {r.cobranca.clienteId}</div>
                {r.cobranca.erro && <div className="small text-danger">{r.cobranca.erro}</div>}
                <div><button className="btn btn-sm" onClick={onParar}>Desativar cobrança automática</button></div>
              </>
            ) : (
              <>
                <div className="small">Faturas emitidas e baixadas manualmente no console.</div>
                {asaas.disponivel && r.status !== 'Cancelada' && <div><button className="btn btn-sm btn-primary" onClick={onCobrar}>Ativar cobrança automática</button></div>}
              </>
            )}
          </div>
          {r.observacoes && <div className="small"><strong>Observações:</strong> {r.observacoes}</div>}
        </div>
      </div>
    </Modal>
  );
}


/* ---------------- Ativar cobrança automática ---------------- */
function AtivarCobranca({ r, onClose }: { r: LinhaAssinante; onClose: () => void }) {
  const { asaas } = usePlataforma();
  const { toast } = useStore();
  const [forma, setForma] = useState<FormaPagamento>('UNDEFINED');
  const [enviando, setEnviando] = useState(false);
  const venc = proximoVencimento(r);
  const docOk = documentoValido(r.cnpj);
  return (
    <Modal title={<span className="row"><CreditCard size={18} /> Cobrança automática · {r.empresa}</span>} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" disabled={!docOk || enviando} onClick={async () => {
        setEnviando(true);
        const e = await asaas.ativar(r.id, forma);
        setEnviando(false);
        if (e) return toast(e, 'error');
        toast('Assinatura mensal criada no Asaas. As faturas e baixas agora são automáticas.');
        onClose();
      }}>{enviando ? 'Criando no Asaas…' : 'Criar assinatura no Asaas'}</button>
    </>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Forma de pagamento">
          <select className="select" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>{FORMAS_PAGAMENTO.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        </Field>
        <dl className="dl">
          <dt>Valor mensal</dt><dd className="strong">{money(r.valor)}</dd>
          <dt>Primeiro vencimento</dt><dd>{date(venc)}{r.status === 'Trial' ? ' (após o teste grátis)' : ''} · depois todo dia {r.diaVencimento}</dd>
          <dt>Cliente no Asaas</dt><dd>{r.empresa} · {r.cnpj || 'sem CPF/CNPJ'} · {r.email}</dd>
        </dl>
        {!docOk && <div className="small text-danger">CPF/CNPJ ausente ou inválido ({r.cnpj || 'vazio'}). O Asaas exige um documento válido: edite o cadastro da empresa antes de ativar.</div>}
        <div className="small muted">
          O Asaas envia a fatura ao cliente (e-mail/SMS conforme sua conta), recebe por {nomeForma(forma)} e avisa o Pivot Hub pelo webhook: a fatura é baixada,
          testes pagos viram assinatura e contas inadimplentes voltam a ficar ativas sozinhas. Mudanças de plano atualizam o valor no Asaas automaticamente.
        </div>
      </div>
    </Modal>
  );
}
