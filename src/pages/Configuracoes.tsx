import { useRef, useState } from 'react';
import { BadgeCheck, Building2, Check, Database as DbIcon, Download, KeyRound, Layers, Lock, Plus, RotateCcw, Target, Upload, X } from 'lucide-react';
import { useStore } from '../store/Store';
import type { Database, Empresa } from '../types';
import { Badge, Confirm, Modal, PageHeader } from '../components/ui';
import { LISTAS_EDITAVEIS, rotuloModulo, SEGMENTOS, segmentoPorId, type ListaEditavel } from '../store/segmentos';
import { MODULOS } from '../store/seed';
import { Field, toNumber } from '../components/fields';
import { date, money, today, uid } from '../utils/format';

export default function Configuracoes() {
  const { db, setEmpresa, resetDemo, replaceDb, changePassword, modo, toast, assinatura, negocio } = useStore();
  const cliente = assinatura && !assinatura.principal ? assinatura : null;
  const [senhas, setSenhas] = useState({ atual: '', nova: '', conf: '' });
  const [f, setF] = useState<Empresa>(db.empresa);
  const [reset, setReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Empresa>(k: K, v: Empresa[K]) => setF((x) => ({ ...x, [k]: v }));

  // Referência para a meta: média mensal dos últimos 3 meses fechados
  const ref = (() => {
    const d = new Date();
    const vals = [1, 2, 3].map((i) => {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const k = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      return db.lancamentos.filter((l) => l.tipo === 'Receita' && l.data.startsWith(k)).reduce((a, l) => a + l.valor, 0);
    });
    return vals.reduce((a, b) => a + b, 0) / 3;
  })();

  const backup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `pivothub-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const importar = (file: File) => {
    file.text().then((t) => {
      const data = JSON.parse(t) as Database;
      if (!Array.isArray(data.clientes) || !Array.isArray(data.lancamentos)) throw new Error('inválido');
      return replaceDb(data).then((err) => toast(err ?? 'Backup restaurado.', err ? 'error' : 'success'));
    }).catch(() => toast('Arquivo de backup inválido.', 'error'));
  };

  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados da empresa, segmento do negócio, metas e gestão dos dados do sistema." />
      <SegmentoCard />
      {cliente && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3 className="row"><BadgeCheck size={16} color="var(--primary)" /> Minha assinatura</h3>
            <Badge tone={cliente.status === 'Ativa' ? 'green' : cliente.status === 'Trial' ? 'purple' : 'orange'}>{cliente.status === 'Trial' ? 'Teste grátis' : cliente.status}</Badge>
          </div>
          <div className="card-pad" style={{ display: 'grid', gap: 12 }}>
            <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
              <div><div className="small muted">Plano</div><div className="strong" style={{ fontSize: 18 }}>{cliente.plano}</div></div>
              <div><div className="small muted">Mensalidade</div><div className="strong" style={{ fontSize: 18 }}>{money(cliente.valorMensal)}</div></div>
              <div><div className="small muted">Usuários</div><div className="strong" style={{ fontSize: 18 }}>{db.usuarios.filter((u) => u.status === 'Ativo').length} de {cliente.maxUsuarios}</div></div>
              {cliente.status === 'Trial' && cliente.trialFim && <div><div className="small muted">Teste até</div><div className="strong" style={{ fontSize: 18 }}>{date(cliente.trialFim)}</div></div>}
              {cliente.faturaAberta && (
                <div>
                  <div className="small muted">Próxima mensalidade{cliente.forma ? ` · ${({ UNDEFINED: 'Pix, boleto ou cartão', PIX: 'Pix', BOLETO: 'boleto', CREDIT_CARD: 'cartão' } as Record<string, string>)[cliente.forma]}` : ''}</div>
                  <div className="row" style={{ gap: 10 }}>
                    <span className={`strong ${cliente.faturaAberta.vencida ? 'text-danger' : ''}`} style={{ fontSize: 18 }}>{money(cliente.faturaAberta.valor)} · {date(cliente.faturaAberta.vencimento)}</span>
                    {cliente.faturaAberta.link && <a className="btn btn-sm btn-primary" href={cliente.faturaAberta.link} target="_blank" rel="noreferrer">Pagar</a>}
                  </div>
                </div>
              )}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {MODULOS.map((m) => cliente.modulos.includes(m.id)
                ? <Badge key={m.id} tone="blue"><Check size={10} /> {rotuloModulo(m.id, m.label, negocio)}</Badge>
                : <Badge key={m.id} tone="gray"><Lock size={10} /> {rotuloModulo(m.id, m.label, negocio)}</Badge>)}
            </div>
            <div className="small muted">Para mudar de plano, contratar usuários extras ou módulos avulsos, fale com o comercial Pivot Hub. A liberação é imediata e os dados são mantidos.</div>
          </div>
        </div>
      )}
      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><h3 className="row"><Building2 size={16} color="var(--primary)" /> Dados da empresa</h3></div>
          <form className="form-grid" style={{ padding: 20 }} onSubmit={(e) => { e.preventDefault(); setEmpresa({ ...f, segmento: db.empresa.segmento, listas: db.empresa.listas }); toast('Configurações salvas.'); }}>
            <Field label="Nome fantasia" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
            <Field label="CNPJ"><input className="input" value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
            <Field label="Telefone"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
            <Field label="E-mail"><input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Cidade/UF"><input className="input" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></Field>
            <div className="full divider" />
            <div className="full row strong"><Target size={16} color="var(--primary)" /> Metas e alertas</div>
            <Field label="Meta de faturamento mensal (R$)" hint={`Média dos últimos 3 meses fechados: ${money(ref)}. Uma meta 5–10% acima da média é desafiadora e realista.`}>
              <input className="input" inputMode="decimal" defaultValue={String(f.metaMensal).replace('.', ',')} onChange={(e) => set('metaMensal', toNumber(e.target.value))} />
            </Field>
            <Field label="Alertar orçamentos que vencem em até (dias)">
              <input className="input" type="number" min={1} max={60} value={f.diasAlertaOrcamento} onChange={(e) => set('diasAlertaOrcamento', Number(e.target.value))} />
            </Field>
            <Field label="Meta de posts por semana (redes sociais)" hint="Usada no indicador de frequência e nos alertas de Social Media.">
              <input className="input" type="number" min={1} max={21} value={f.metaPostsSemana ?? 3} onChange={(e) => set('metaPostsSemana', Number(e.target.value))} />
            </Field>
            <div className="full"><button className="btn btn-primary">Salvar configurações</button></div>
          </form>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="row"><DbIcon size={16} color="var(--primary)" /> Dados do sistema</h3></div>
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <p className="small muted" style={{ margin: 0 }}>
              {modo === 'remote'
                ? 'Os dados estão no banco Cloudflare D1 e são compartilhados por todos os usuários. Exporte backups periódicos.'
                : 'Modo local: os dados ficam salvos neste navegador. Faça backups periódicos para não perdê-los ao limpar o navegador ou trocar de computador.'}
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={backup}><Download size={15} /> Exportar backup (JSON)</button>
              <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Restaurar backup</button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
            </div>
            <div className="divider" style={{ margin: 0 }} />
            <div className="small">
              <strong>Resumo da base:</strong> {db.clientes.length} clientes · {db.orcamentos.length} orçamentos · {db.ordens.length} OS · {db.equipamentos.length} {negocio.rotulos.ativos.toLowerCase()} · {db.lancamentos.length} lançamentos
            </div>
            {/* a base de exemplo é de uma empresa de tecnologia: só faz sentido nesse segmento */}
            {(!cliente || negocio.id === 'tecnologia') && <div>
              <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => setReset(true)}><RotateCcw size={15} /> {cliente ? 'Carregar dados de exemplo' : 'Restaurar dados de demonstração'}</button>
            </div>}
          </div>
        </div>
      </div>
      {modo === 'remote' && (
        <div className="card mt" style={{ maxWidth: 520 }}>
          <div className="card-head"><h3 className="row"><KeyRound size={16} color="var(--primary)" /> Alterar minha senha</h3></div>
          <form className="form-grid" style={{ padding: 20 }} onSubmit={async (e) => {
            e.preventDefault();
            if (senhas.nova !== senhas.conf) return toast('A confirmação não confere.', 'error');
            const err = await changePassword(senhas.nova, senhas.atual);
            toast(err ?? 'Senha alterada.', err ? 'error' : 'success');
            if (!err) setSenhas({ atual: '', nova: '', conf: '' });
          }}>
            <Field label="Senha atual" full><input className="input" type="password" value={senhas.atual} onChange={(e) => setSenhas({ ...senhas, atual: e.target.value })} required /></Field>
            <Field label="Nova senha" hint="Mínimo de 6 caracteres."><input className="input" type="password" minLength={6} value={senhas.nova} onChange={(e) => setSenhas({ ...senhas, nova: e.target.value })} required /></Field>
            <Field label="Confirmar nova senha"><input className="input" type="password" value={senhas.conf} onChange={(e) => setSenhas({ ...senhas, conf: e.target.value })} required /></Field>
            <div className="full"><button className="btn btn-primary">Alterar senha</button></div>
          </form>
        </div>
      )}
      {reset && <Confirm label="Restaurar" text={cliente ? 'Clientes, orçamentos, OS e demais registros serão substituídos por dados de exemplo. Usuários e dados da empresa são mantidos. Deseja continuar?' : 'Todos os dados atuais serão substituídos pelos dados de demonstração. Deseja continuar?'} onClose={() => setReset(false)} onConfirm={() => { resetDemo().then((err) => toast(err ?? 'Dados de demonstração restaurados.', err ? 'error' : 'success')); }} />}
    </>
  );
}

/** Segmento do negócio: define categorias, catálogo sugerido e nomes de telas; as listas podem ser personalizadas. */
function SegmentoCard() {
  const { db, setEmpresa, upsert, negocio, toast } = useStore();
  const [trocar, setTrocar] = useState<string | null>(null);
  const [importar, setImportar] = useState(true);
  const [novo, setNovo] = useState<Partial<Record<ListaEditavel, string>>>({});
  const atual = segmentoPorId(db.empresa.segmento);
  const listas = db.empresa.listas ?? {};

  const salvarLista = (id: ListaEditavel, valores: string[]) => {
    setEmpresa({ ...db.empresa, listas: { ...listas, [id]: valores } });
  };
  const adicionar = (id: ListaEditavel) => {
    const v = (novo[id] ?? '').trim();
    if (!v) return;
    if (negocio[id].some((x) => x.toLowerCase() === v.toLowerCase())) return toast('Este item já está na lista.', 'error');
    salvarLista(id, [...negocio[id], v]);
    setNovo((n) => ({ ...n, [id]: '' }));
  };
  const remover = (id: ListaEditavel, v: string) => {
    if (negocio[id].length <= 1) return toast('A lista precisa de ao menos um item.', 'error');
    salvarLista(id, negocio[id].filter((x) => x !== v));
  };
  const aplicarSegmento = (id: string) => {
    const seg = segmentoPorId(id);
    setEmpresa({ ...db.empresa, segmento: id, listas: {} });
    if (importar) {
      // só acrescenta o que ainda não existe; nada do que a empresa já cadastrou é alterado
      const servicos = new Set(db.servicos.map((x) => x.nome.toLowerCase()));
      const itens = new Set(db.pecas.map((x) => x.nome.toLowerCase()));
      let ns = 0, ni = 0;
      for (const [nome, categoria, preco, custo, duracaoHoras] of seg.servicos) {
        if (servicos.has(nome.toLowerCase())) continue;
        upsert('servicos', { id: uid(), nome, categoria, preco, custo, duracaoHoras, ativo: true }); ns++;
      }
      seg.materiais.forEach(([nome, categoria, custoUnit, precoVenda], i) => {
        if (itens.has(nome.toLowerCase())) return;
        upsert('pecas', { id: uid(), nome, categoria, sku: `${seg.id.slice(0, 3).toUpperCase()}-${String(db.pecas.length + i + 1).padStart(3, '0')}`, quantidade: 0, minimo: 0, custoUnit, precoVenda }); ni++;
      });
      toast(`Segmento ${seg.nome} aplicado: ${ns} serviço(s) e ${ni} item(ns) de estoque sugeridos foram adicionados.`);
    } else toast(`Segmento ${seg.nome} aplicado.`);
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div>
          <h3 className="row"><Layers size={16} color="var(--primary)" /> Segmento do negócio</h3>
          <div className="card-sub">Define as categorias, o catálogo sugerido e os nomes de telas como {negocio.rotulos.ativos}, Estoque de {negocio.rotulos.materiais} e {negocio.rotulos.turmas}.</div>
        </div>
      </div>
      <div className="card-pad" style={{ display: 'grid', gap: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <select className="select" style={{ maxWidth: 360 }} value={atual.id} onChange={(e) => e.target.value !== atual.id && setTrocar(e.target.value)}>
            {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <span className="small muted">{atual.exemplos}</span>
        </div>
        <div className="grid g-3" style={{ gap: 14 }}>
          {LISTAS_EDITAVEIS.map(({ id, rotulo }) => (
            <div key={id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <strong className="small">{rotulo}</strong>
                {listas[id]?.length ? <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11.5 }} onClick={() => { const { [id]: _x, ...resto } = listas; setEmpresa({ ...db.empresa, listas: resto }); }}>Restaurar padrão</button> : null}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {negocio[id].map((v) => (
                  <span key={v} className="badge b-blue" style={{ paddingRight: 4 }}>{v}
                    <button aria-label={`Remover ${v}`} onClick={() => remover(id, v)} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, marginLeft: 2, color: 'inherit', display: 'inline-flex' }}><X size={12} /></button>
                  </span>
                ))}
              </div>
              <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); adicionar(id); }}>
                <input className="input" style={{ height: 32 }} placeholder="Adicionar..." value={novo[id] ?? ''} onChange={(e) => setNovo((n) => ({ ...n, [id]: e.target.value }))} />
                <button className="btn btn-sm" aria-label="Adicionar"><Plus size={14} /></button>
              </form>
            </div>
          ))}
        </div>
      </div>
      {trocar && (
        <Modal title={`Trocar para ${segmentoPorId(trocar).nome}?`} onClose={() => setTrocar(null)} footer={<>
          <button className="btn" onClick={() => setTrocar(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { aplicarSegmento(trocar); setTrocar(null); }}>Aplicar segmento</button>
        </>}>
          <p style={{ marginTop: 0 }}>As listas e os nomes de telas passam a ser os de <strong>{segmentoPorId(trocar).nome}</strong> (as personalizações atuais das listas são descartadas). Clientes, OS, orçamentos e lançamentos já cadastrados <strong>não são alterados</strong>.</p>
          <label className="check"><input type="checkbox" checked={importar} onChange={(e) => setImportar(e.target.checked)} /> Adicionar o catálogo sugerido ({segmentoPorId(trocar).servicos.length} serviços com preço e {segmentoPorId(trocar).materiais.length} itens de estoque)</label>
        </Modal>
      )}
    </div>
  );
}
