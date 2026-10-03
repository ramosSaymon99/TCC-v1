import { useState } from 'react';
import { AlertTriangle, CalendarDays, GraduationCap, MapPin, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { useStore } from '../store/Store';
import type { Turma } from '../types';
import { Badge, Confirm, Empty, Kpi, Modal, PageHeader } from '../components/ui';
import { ClienteSelect, Field, Options, toNumber } from '../components/fields';
import { addDays, date, diffDays, money, pct, today, uid } from '../utils/format';

const STATUS: Turma['status'][] = ['Inscrições abertas', 'Em andamento', 'Concluída', 'Cancelada'];
const TONE: Record<Turma['status'], string> = { 'Inscrições abertas': 'blue', 'Em andamento': 'green', 'Concluída': 'gray', 'Cancelada': 'red' };

/** Indicadores de uma turma: ocupação, ponto de equilíbrio e resultado. */
export function analisarTurma(t: Turma, hoje = today()) {
  const n = t.alunos.length;
  const ocupacao = t.vagas ? n / t.vagas : 0;
  const equilibrio = t.precoAluno ? Math.ceil(t.custoTurma / t.precoAluno) : 0;
  const receita = n * t.precoAluno;
  const recebido = t.alunos.filter((a) => a.pago).length * t.precoAluno;
  const diasInicio = diffDays(t.inicio, hoje);
  const risco = t.status === 'Inscrições abertas' && diasInicio <= 10 && n < equilibrio;
  return { n, ocupacao, equilibrio, receita, recebido, lucro: receita - t.custoTurma, diasInicio, risco, aReceber: receita - recebido };
}

export default function Treinamentos() {
  const { db, upsert, remove, toast } = useStore();
  const [filtro, setFiltro] = useState<string>('ativas');
  const [aberta, setAberta] = useState<Turma | null>(null);
  const [deleting, setDeleting] = useState<Turma | null>(null);
  const hoje = today();

  const turmas = [...db.turmas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const ativas = turmas.filter((t) => t.status === 'Inscrições abertas' || t.status === 'Em andamento');
  const lista = filtro === 'ativas' ? ativas : filtro ? turmas.filter((t) => t.status === filtro) : turmas;

  const an = ativas.map((t) => analisarTurma(t, hoje));
  const vagas = ativas.reduce((a, t) => a + t.vagas, 0);
  const alunos = an.reduce((a, x) => a + x.n, 0);
  const receitaPrev = an.reduce((a, x) => a + x.receita, 0);
  const aReceber = turmas.reduce((a, t) => a + analisarTurma(t, hoje).aReceber, 0);
  const emRisco = ativas.filter((t) => analisarTurma(t, hoje).risco);
  const vagasLivres = ativas.filter((t) => t.status === 'Inscrições abertas').reduce((a, t) => a + Math.max(0, t.vagas - t.alunos.length) * t.precoAluno, 0);

  return (
    <>
      <PageHeader title="Turmas de Treinamento" subtitle="Cursos de informática: vagas, ocupação, ponto de equilíbrio e pagamentos dos alunos.">
        <button className="btn btn-primary" onClick={() => setAberta({ id: uid(), curso: '', inicio: addDays(hoje, 14), fim: addDays(hoje, 35), horario: '', local: 'Sala TechGest', vagas: 10, precoAluno: 0, custoTurma: 0, status: 'Inscrições abertas', alunos: [] })}>
          <Plus size={16} /> Nova turma
        </button>
      </PageHeader>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi icon={<GraduationCap size={20} />} tone="blue" label="Turmas ativas" value={ativas.length} foot={`${turmas.filter((t) => t.status === 'Concluída').length} concluídas no histórico`} />
        <Kpi icon={<Users size={20} />} tone="green" label="Ocupação média" value={pct(vagas ? alunos / vagas : 0)} foot={`${alunos} alunos em ${vagas} vagas`}>
          <div className="meter"><span style={{ width: `${Math.min(100, vagas ? (alunos / vagas) * 100 : 0)}%`, background: 'var(--success)' }} /></div>
        </Kpi>
        <Kpi icon={<Wallet size={20} />} tone="purple" label="Receita prevista (ativas)" value={money(receitaPrev)} foot={`+${money(vagasLivres)} se as vagas abertas lotarem`} />
        <Kpi icon={<AlertTriangle size={20} />} tone="orange" label="A receber de alunos" value={money(aReceber)}
          foot={emRisco.length ? <span className="text-danger strong">{emRisco.length} turma(s) abaixo do equilíbrio</span> : 'Todas as turmas cobrem o custo'} />
      </div>

      {emRisco.length > 0 && (
        <div className="insight risk" style={{ marginBottom: 16 }}>
          <div className="ico tone-red"><AlertTriangle size={16} /></div>
          <div>
            {emRisco.map((t) => {
              const a = analisarTurma(t, hoje);
              return <div key={t.id} className="d">• <strong>{t.curso}</strong> começa em {a.diasInicio} dia(s) com {a.n} aluno(s): faltam <strong>{a.equilibrio - a.n}</strong> para cobrir o custo de {money(t.custoTurma)}. Ação: divulgar para clientes que já fizeram treinamentos ou avaliar adiar a turma.</div>;
            })}
          </div>
        </div>
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        {[['ativas', 'Ativas'], ['Concluída', 'Concluídas'], ['Cancelada', 'Canceladas'], ['', 'Todas']].map(([k, l]) => (
          <button key={k} className={filtro === k ? 'active' : ''} onClick={() => setFiltro(k)}>{l}</button>
        ))}
      </div>

      {lista.length === 0 ? <div className="card"><Empty text="Nenhuma turma neste filtro." /></div> : (
        <div className="grid g-3">
          {lista.map((t) => {
            const a = analisarTurma(t, hoje);
            const eqPct = t.vagas ? Math.min(100, (a.equilibrio / t.vagas) * 100) : 0;
            return (
              <div key={t.id} className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => setAberta(t)}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div><div className="strong" style={{ fontSize: 15 }}>{t.curso}</div><div className="small muted row" style={{ gap: 4, marginTop: 2 }}><CalendarDays size={12} />{date(t.inicio)} a {date(t.fim)}</div></div>
                  <Badge tone={TONE[t.status]}>{t.status}</Badge>
                </div>
                <div className="small muted row" style={{ gap: 4, marginTop: 6 }}><MapPin size={12} />{t.local} · {t.horario}</div>
                <div className="row between small" style={{ marginTop: 14 }}>
                  <span><strong>{a.n}</strong>/{t.vagas} alunos</span><span className="muted">{pct(a.ocupacao)}</span>
                </div>
                <div className="meter" style={{ position: 'relative', height: 8 }} title={`Ponto de equilíbrio: ${a.equilibrio} alunos`}>
                  <span style={{ width: `${Math.min(100, a.ocupacao * 100)}%`, background: a.n >= a.equilibrio ? 'var(--success)' : 'var(--warning)' }} />
                  <i style={{ position: 'absolute', left: `${eqPct}%`, top: -3, width: 2, height: 14, background: 'var(--text)' }} />
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>Equilíbrio: {a.equilibrio} alunos (custo {money(t.custoTurma)})</div>
                <div className="divider" />
                <div className="grid g-2" style={{ gap: 8 }}>
                  <div><div className="small muted">Resultado previsto</div><div className={`strong ${a.lucro < 0 ? 'text-danger' : 'text-success'}`}>{money(a.lucro)}</div></div>
                  <div><div className="small muted">A receber</div><div className="strong">{money(a.aReceber)}</div></div>
                </div>
                {a.risco && <div className="small text-danger strong" style={{ marginTop: 8 }}>⚠ Começa em {a.diasInicio} dias abaixo do equilíbrio</div>}
              </div>
            );
          })}
        </div>
      )}

      {aberta && <TurmaModal t={aberta} onClose={() => setAberta(null)}
        onDelete={db.turmas.some((x) => x.id === aberta.id) ? () => { setDeleting(aberta); setAberta(null); } : undefined}
        onSave={(t) => {
          if (!t.curso || t.precoAluno <= 0) return toast('Informe curso e preço por aluno.', 'error');
          if (t.alunos.length > t.vagas) return toast('Há mais alunos que vagas.', 'error');
          // Pagamentos marcados agora viram receitas; desmarcados removem a receita correspondente
          const antes = db.turmas.find((x) => x.id === t.id);
          for (const al of t.alunos) {
            const eraPago = antes?.alunos.find((x) => x.nome === al.nome)?.pago ?? false;
            const desc = `Turma ${t.curso} - ${al.nome}`;
            if (al.pago && !eraPago) upsert('lancamentos', { id: uid(), tipo: 'Receita', descricao: desc, categoria: 'Treinamento', valor: t.precoAluno, data: hoje, status: 'Pago', clienteId: al.clienteId, turmaId: t.id });
            if (!al.pago && eraPago) {
              const l = db.lancamentos.find((x) => x.turmaId === t.id && x.descricao === desc);
              if (l) remove('lancamentos', l.id);
            }
          }
          upsert('turmas', t); toast('Turma salva.'); setAberta(null);
        }} />}
      {deleting && <Confirm text={<>Excluir a turma <strong>{deleting.curso}</strong>?</>} onClose={() => setDeleting(null)} onConfirm={() => { remove('turmas', deleting.id); toast('Turma excluída.'); }} />}
    </>
  );
}

function TurmaModal({ t, onClose, onSave, onDelete }: { t: Turma; onClose: () => void; onSave: (t: Turma) => void; onDelete?: () => void }) {
  const [f, setF] = useState<Turma>({ ...t, alunos: t.alunos.map((a) => ({ ...a })) });
  const [novo, setNovo] = useState('');
  const [cli, setCli] = useState('');
  const set = <K extends keyof Turma>(k: K, v: Turma[K]) => setF((x) => ({ ...x, [k]: v }));
  const a = analisarTurma(f);
  return (
    <Modal wide title={t.curso ? t.curso : 'Nova turma'} onClose={onClose} footer={<>
      {onDelete && <button className="btn" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={onDelete}><Trash2 size={15} /> Excluir</button>}
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="turma-form">Salvar</button>
    </>}>
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <form id="turma-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
          <Field label="Curso" full><input className="input" value={f.curso} onChange={(e) => set('curso', e.target.value)} required /></Field>
          <Field label="Início"><input className="input" type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} /></Field>
          <Field label="Fim"><input className="input" type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} /></Field>
          <Field label="Horário"><input className="input" value={f.horario} onChange={(e) => set('horario', e.target.value)} placeholder="Ter e Qui · 19h–21h" /></Field>
          <Field label="Local"><input className="input" value={f.local} onChange={(e) => set('local', e.target.value)} /></Field>
          <Field label="Vagas"><input className="input" type="number" min={1} value={f.vagas} onChange={(e) => set('vagas', Number(e.target.value))} /></Field>
          <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Turma['status'])}><Options items={STATUS} /></select></Field>
          <Field label="Preço por aluno (R$)"><input className="input" inputMode="decimal" defaultValue={f.precoAluno ? String(f.precoAluno).replace('.', ',') : ''} onChange={(e) => set('precoAluno', toNumber(e.target.value))} required /></Field>
          <Field label="Custo da turma (R$)" hint="Instrutor, material, sala."><input className="input" inputMode="decimal" defaultValue={f.custoTurma ? String(f.custoTurma).replace('.', ',') : ''} onChange={(e) => set('custoTurma', toNumber(e.target.value))} /></Field>
          <div className="full small muted">
            Equilíbrio: <strong>{a.equilibrio} alunos</strong> · Resultado previsto: <strong className={a.lucro < 0 ? 'text-danger' : 'text-success'}>{money(a.lucro)}</strong> · Lotada renderia <strong>{money(f.vagas * f.precoAluno - f.custoTurma)}</strong>
          </div>
        </form>
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong>Alunos ({f.alunos.length}/{f.vagas})</strong>
            <span className="small muted">{f.alunos.filter((x) => x.pago).length} pagos · marcar "pago" lança a receita</span>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            {f.alunos.map((al, i) => (
              <div key={`${al.nome}-${i}`} className="row between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                <span className="small">{al.nome}</span>
                <span className="row">
                  <label className="check small"><input type="checkbox" checked={al.pago} onChange={() => setF((x) => ({ ...x, alunos: x.alunos.map((y, j) => (j === i ? { ...y, pago: !y.pago } : y)) }))} /> Pago</label>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setF((x) => ({ ...x, alunos: x.alunos.filter((_, j) => j !== i) }))} aria-label="Remover"><Trash2 size={14} /></button>
                </span>
              </div>
            ))}
            {f.alunos.length === 0 && <div className="small muted" style={{ padding: 14 }}>Nenhum aluno inscrito.</div>}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" placeholder="Nome do aluno" value={novo} onChange={(e) => setNovo(e.target.value)} />
            <button type="button" className="btn btn-primary btn-icon" disabled={!novo.trim() || f.alunos.length >= f.vagas} aria-label="Adicionar"
              onClick={() => { setF((x) => ({ ...x, alunos: [...x.alunos, { nome: novo.trim(), pago: false, clienteId: cli || undefined }] })); setNovo(''); setCli(''); }}><Plus size={16} /></button>
          </div>
          <div style={{ marginTop: 8 }}><ClienteSelect allowEmpty value={cli} onChange={setCli} /></div>
          <div className="small muted" style={{ marginTop: 4 }}>Vincular a um cliente (opcional) registra o histórico de compras dele.</div>
        </div>
      </div>
    </Modal>
  );
}
