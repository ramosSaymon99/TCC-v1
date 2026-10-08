import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../store/Store';
import { ANAMNESE_VAZIA } from '../store/seed';
import {
  ATIVIDADES, FORMAS_PAGAMENTO, OBJETIVOS, ORIGENS, STATUS_CONSULTA, TIPOS_CONSULTA,
  type Avaliacao, type Consulta, type FormaPagamento, type Pacote, type Paciente, type TipoConsulta,
} from '../types';
import { date, money, today, uid } from '../utils/format';
import { classeImc, cinturaRisco, imc, rcqRisco } from '../utils/nutri';
import { Field, Options, PacienteSelect, toNumber } from './fields';
import { Badge, Modal } from './ui';

const toMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

/** Consultas do mesmo dia que se sobrepõem ao horário informado. */
export function conflitos(consultas: Consulta[], c: Pick<Consulta, 'id' | 'data' | 'hora' | 'duracao'>) {
  const ini = toMin(c.hora), fim = ini + c.duracao;
  return consultas.filter((o) => o.id !== c.id && o.data === c.data && o.status !== 'Cancelada' && o.status !== 'Faltou'
    && toMin(o.hora) < fim && toMin(o.hora) + o.duracao > ini);
}

/** Saldo de consultas do pacote (agendadas e realizadas consomem o saldo). */
export function saldoPacote(p: Pacote, consultas: Consulta[], ignorarId?: string) {
  const usadas = consultas.filter((c) => c.pacoteId === p.id && c.id !== ignorarId && (c.status === 'Realizada' || c.status === 'Agendada' || c.status === 'Confirmada')).length;
  return p.consultas - usadas;
}

/* ---------- Consulta ---------- */
export function ConsultaModal({ consulta, pacienteId, data, hora, onClose }: {
  consulta?: Consulta; pacienteId?: string; data?: string; hora?: string; onClose: () => void;
}) {
  const { db, upsert, toast } = useStore();
  const cfg = db.config;
  const temHistorico = (pid: string) => db.consultas.some((c) => c.pacienteId === pid && c.status === 'Realizada');
  const tipoInicial: TipoConsulta = pacienteId && temHistorico(pacienteId) ? 'Retorno' : 'Primeira consulta';
  const [f, setF] = useState<Consulta>(consulta ?? {
    id: uid(), pacienteId: pacienteId ?? '', data: data ?? today(), hora: hora ?? '09:00',
    tipo: tipoInicial, duracao: cfg.duracoes[tipoInicial], status: 'Agendada', valor: cfg.precos[tipoInicial], pago: false, forma: 'PIX',
  });
  const set = <K extends keyof Consulta>(k: K, v: Consulta[K]) => setF((x) => ({ ...x, [k]: v }));

  const pacotesAbertos = useMemo(
    () => db.pacotes.filter((p) => p.pacienteId === f.pacienteId && (p.id === consulta?.pacoteId || saldoPacote(p, db.consultas, f.id) > 0)),
    [db.pacotes, db.consultas, f.pacienteId, f.id, consulta?.pacoteId],
  );
  const conf = conflitos(db.consultas, f);
  const nome = (id: string) => db.pacientes.find((p) => p.id === id)?.nome ?? '—';

  const trocarPaciente = (id: string) => {
    const tipo: TipoConsulta = temHistorico(id) ? 'Retorno' : 'Primeira consulta';
    setF((x) => ({ ...x, pacienteId: id, pacoteId: undefined, tipo, duracao: cfg.duracoes[tipo], valor: cfg.precos[tipo] }));
  };
  const trocarTipo = (tipo: TipoConsulta) => setF((x) => ({ ...x, tipo, duracao: cfg.duracoes[tipo], valor: x.pacoteId ? 0 : cfg.precos[tipo] }));
  const usarPacote = (id: string) => setF((x) => ({ ...x, pacoteId: id || undefined, valor: id ? 0 : cfg.precos[x.tipo], pago: id ? true : x.pago }));

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    if (!f.pacienteId) return;
    upsert('consultas', f);
    toast(consulta ? 'Consulta atualizada.' : 'Consulta agendada.');
    onClose();
  };

  return (
    <Modal title={consulta ? 'Editar consulta' : 'Nova consulta'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" type="submit" form="f-consulta">Salvar</button>
    </>}>
      <form id="f-consulta" className="form-grid" onSubmit={salvar}>
        <Field label="Paciente" full><PacienteSelect value={f.pacienteId} onChange={trocarPaciente} /></Field>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} required /></Field>
        <Field label="Horário"><input className="input" type="time" step={600} value={f.hora} onChange={(e) => set('hora', e.target.value)} required /></Field>
        <Field label="Tipo"><select className="select" value={f.tipo} onChange={(e) => trocarTipo(e.target.value as TipoConsulta)}><Options items={TIPOS_CONSULTA} /></select></Field>
        <Field label="Duração (min)"><input className="input" type="number" min={10} step={5} value={f.duracao} onChange={(e) => set('duracao', toNumber(e.target.value))} /></Field>
        {pacotesAbertos.length > 0 && (
          <Field label="Pacote" full hint="Consultas cobertas por pacote não geram nova cobrança — a receita foi lançada na venda do pacote.">
            <select className="select" value={f.pacoteId ?? ''} onChange={(e) => usarPacote(e.target.value)}>
              <option value="">Cobrar consulta avulsa</option>
              {pacotesAbertos.map((p) => <option key={p.id} value={p.id}>{p.nome} · saldo {saldoPacote(p, db.consultas, f.id)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={f.valor} disabled={!!f.pacoteId} onChange={(e) => set('valor', toNumber(e.target.value))} /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Consulta['status'])}><Options items={STATUS_CONSULTA} /></select></Field>
        <Field label="Forma de pagamento"><select className="select" value={f.forma ?? 'PIX'} onChange={(e) => set('forma', e.target.value as FormaPagamento)}><Options items={FORMAS_PAGAMENTO} /></select></Field>
        <Field label="Pagamento">
          <label className="check" style={{ height: 36 }}><input type="checkbox" checked={f.pago} onChange={(e) => set('pago', e.target.checked)} /> Pago</label>
        </Field>
        <Field label="Observações" full><textarea className="textarea" value={f.obs ?? ''} onChange={(e) => set('obs', e.target.value)} placeholder="Ex.: trazer exames de sangue" /></Field>
        {conf.length > 0 && (
          <div className="full insight warn">
            <div className="ico tone-orange"><AlertTriangle size={16} /></div>
            <div><div className="t">Conflito de horário</div><div className="d">{conf.map((c) => `${c.hora} · ${nome(c.pacienteId)} (${c.tipo})`).join(' | ')}</div></div>
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ---------- Paciente ---------- */
export function PacienteModal({ paciente, onClose, onSaved }: { paciente?: Paciente; onClose: () => void; onSaved?: (id: string) => void }) {
  const { upsert, toast } = useStore();
  const [f, setF] = useState<Paciente>(paciente ?? {
    id: uid(), nome: '', sexo: 'F', nascimento: '1990-01-01', telefone: '', email: '', objetivo: 'Emagrecimento', origem: 'Instagram',
    atividade: 'Leve', alturaCm: 165, criadoEm: today(), observacoes: '', anamnese: { ...ANAMNESE_VAZIA },
  });
  const set = <K extends keyof Paciente>(k: K, v: Paciente[K]) => setF((x) => ({ ...x, [k]: v }));
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    upsert('pacientes', { ...f, nome: f.nome.trim() });
    toast(paciente ? 'Cadastro atualizado.' : 'Paciente cadastrado.');
    onSaved?.(f.id);
    onClose();
  };
  return (
    <Modal title={paciente ? 'Editar paciente' : 'Novo paciente'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" type="submit" form="f-pac">Salvar</button>
    </>}>
      <form id="f-pac" className="form-grid" onSubmit={salvar}>
        <Field label="Nome completo" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Field>
        <Field label="Sexo"><select className="select" value={f.sexo} onChange={(e) => set('sexo', e.target.value as Paciente['sexo'])}><option value="F">Feminino</option><option value="M">Masculino</option></select></Field>
        <Field label="Nascimento"><input className="input" type="date" value={f.nascimento} onChange={(e) => set('nascimento', e.target.value)} required /></Field>
        <Field label="Telefone / WhatsApp"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 90000-0000" required /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Objetivo"><select className="select" value={f.objetivo} onChange={(e) => set('objetivo', e.target.value as Paciente['objetivo'])}><Options items={OBJETIVOS} /></select></Field>
        <Field label="Como conheceu (origem)" hint="Usado para medir quais canais trazem pacientes que ficam."><select className="select" value={f.origem} onChange={(e) => set('origem', e.target.value as Paciente['origem'])}><Options items={ORIGENS} /></select></Field>
        <Field label="Nível de atividade física"><select className="select" value={f.atividade} onChange={(e) => set('atividade', e.target.value as Paciente['atividade'])}><Options items={ATIVIDADES} /></select></Field>
        <Field label="Altura (cm)"><input className="input" inputMode="numeric" value={f.alturaCm} onChange={(e) => set('alturaCm', toNumber(e.target.value))} required /></Field>
        <Field label="Peso meta (kg)" hint="Opcional"><input className="input" inputMode="decimal" value={f.pesoMeta ?? ''} onChange={(e) => set('pesoMeta', e.target.value ? toNumber(e.target.value) : undefined)} /></Field>
        <Field label="Cadastro em"><input className="input" type="date" value={f.criadoEm} onChange={(e) => set('criadoEm', e.target.value)} /></Field>
        <Field label="Observações" full><textarea className="textarea" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

/* ---------- Avaliação antropométrica ---------- */
export function AvaliacaoModal({ paciente, avaliacao, onClose }: { paciente: Paciente; avaliacao?: Avaliacao; onClose: () => void }) {
  const { db, upsert, toast } = useStore();
  const anterior = db.avaliacoes.filter((a) => a.pacienteId === paciente.id && a.id !== avaliacao?.id).sort((a, b) => b.data.localeCompare(a.data))[0];
  const [f, setF] = useState<Avaliacao>(avaliacao ?? { id: uid(), pacienteId: paciente.id, data: today(), peso: anterior?.peso ?? 0 });
  const set = <K extends keyof Avaliacao>(k: K, v: Avaliacao[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: 'cintura' | 'quadril' | 'gordura' | 'massaMagra') => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value ? toNumber(e.target.value) : undefined);

  const vImc = imc(f.peso, paciente.alturaCm);
  const cls = classeImc(vImc);
  const rcq = rcqRisco(paciente.sexo, f.cintura, f.quadril);
  const cint = cinturaRisco(paciente.sexo, f.cintura);
  const delta = anterior ? f.peso - anterior.peso : null;

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    upsert('avaliacoes', f);
    toast('Avaliação registrada.');
    onClose();
  };
  return (
    <Modal title={`Avaliação antropométrica · ${paciente.nome}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" type="submit" form="f-av">Salvar</button>
    </>}>
      <form id="f-av" className="form-grid" onSubmit={salvar}>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} required /></Field>
        <Field label="Peso (kg)"><input className="input" inputMode="decimal" value={f.peso || ''} onChange={(e) => set('peso', toNumber(e.target.value))} required autoFocus /></Field>
        <Field label="Circunferência da cintura (cm)"><input className="input" inputMode="decimal" value={f.cintura ?? ''} onChange={num('cintura')} /></Field>
        <Field label="Circunferência do quadril (cm)"><input className="input" inputMode="decimal" value={f.quadril ?? ''} onChange={num('quadril')} /></Field>
        <Field label="% de gordura corporal"><input className="input" inputMode="decimal" value={f.gordura ?? ''} onChange={num('gordura')} /></Field>
        <Field label="Massa magra (kg)"><input className="input" inputMode="decimal" value={f.massaMagra ?? ''} onChange={num('massaMagra')} /></Field>
        <Field label="Observações" full><textarea className="textarea" value={f.obs ?? ''} onChange={(e) => set('obs', e.target.value)} /></Field>
        <div className="full stat-mini">
          <div><span>IMC</span><b>{vImc ? vImc.toFixed(1).replace('.', ',') : '—'}</b><Badge tone={cls.tone}>{cls.label}</Badge></div>
          <div><span>Variação vs. {anterior ? date(anterior.data) : 'anterior'}</span><b className={delta === null ? '' : delta < 0 ? 'text-success' : delta > 0 ? 'text-warning' : ''}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} kg`}</b></div>
          <div><span>Relação cintura/quadril</span><b>{rcq ? rcq.valor.toFixed(2).replace('.', ',') : '—'}</b>{rcq && <Badge tone={rcq.elevado ? 'red' : 'green'}>{rcq.elevado ? 'Risco elevado' : 'Adequada'}</Badge>}</div>
          <div><span>Cintura (risco cardiometabólico)</span><b>{f.cintura ? `${f.cintura} cm` : '—'}</b>{cint && <Badge tone={cint.tone}>{cint.label}</Badge>}</div>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Pacote ---------- */
export function PacoteModal({ pacienteId, onClose }: { pacienteId: string; onClose: () => void }) {
  const { db, upsert, toast } = useStore();
  const avulso = db.config.precos.Retorno;
  const [f, setF] = useState<Pacote>({ id: uid(), pacienteId, nome: 'Acompanhamento trimestral (3 retornos)', consultas: 3, valor: Math.round(avulso * 3 * 0.9), data: today(), pago: true, forma: 'PIX' });
  const set = <K extends keyof Pacote>(k: K, v: Pacote[K]) => setF((x) => ({ ...x, [k]: v }));
  const desconto = f.consultas ? 1 - f.valor / (avulso * f.consultas) : 0;
  return (
    <Modal title="Vender pacote de acompanhamento" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" type="submit" form="f-pk">Registrar venda</button>
    </>}>
      <form id="f-pk" className="form-grid" onSubmit={(e) => { e.preventDefault(); upsert('pacotes', f); toast('Pacote registrado.'); onClose(); }}>
        <Field label="Nome do pacote" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required /></Field>
        <Field label="Nº de consultas"><input className="input" type="number" min={1} value={f.consultas} onChange={(e) => set('consultas', toNumber(e.target.value))} /></Field>
        <Field label="Valor total (R$)" hint={`Avulso: ${money(avulso * f.consultas)} · desconto de ${(desconto * 100).toFixed(0)}%`}><input className="input" inputMode="decimal" value={f.valor} onChange={(e) => set('valor', toNumber(e.target.value))} /></Field>
        <Field label="Data da venda"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></Field>
        <Field label="Forma de pagamento"><select className="select" value={f.forma} onChange={(e) => set('forma', e.target.value as FormaPagamento)}><Options items={FORMAS_PAGAMENTO} /></select></Field>
        <Field label="Pagamento"><label className="check" style={{ height: 36 }}><input type="checkbox" checked={f.pago} onChange={(e) => set('pago', e.target.checked)} /> Pago</label></Field>
      </form>
    </Modal>
  );
}
