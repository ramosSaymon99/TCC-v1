import { useState } from 'react';
import { api } from '../lib/api';
import { CORES_BEBE, PAPEIS } from '../lib/constants';
import { rotinaSugerida } from '../lib/demo';
import { idade, ymd } from '../lib/time';
import type { Routine } from '../types';
import { Choice, Field } from '../components/ui';
import { RotinaEditor } from './Familia';
import { PhotoPicker } from '../components/Avatar';

/** Cadastro do bebê (registro central) ou entrada em um bebê existente por código de convite. */
export function Onboarding({ onDone, onCancel, userName }: { onDone: (babyId: string) => void; onCancel?: () => void; userName: string }) {
  const [modo, setModo] = useState<'novo' | 'codigo'>('novo');
  const [passo, setPasso] = useState(1);
  const [f, setF] = useState({ name: '', birth_date: '', sex: undefined as 'F' | 'M' | undefined, role: 'mae', peso: '', altura: '', consult_date: ymd(Date.now()), color: CORES_BEBE[0] });
  const [rotina, setRotina] = useState<Routine | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [responsavel, setResponsavel] = useState(false);
  const [code, setCode] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s ? Number(s.replace(',', '.')) : null);

  function avancar() {
    setErro('');
    if (!f.name.trim()) return setErro('Informe o nome do bebê.');
    if (!f.birth_date) return setErro('Informe a data de nascimento.');
    setRotina(rotina ?? rotinaSugerida(Math.max(0, idade(f.birth_date).dias)));
    setPasso(2);
  }
  async function criar(semRotina = false) {
    if (!responsavel) return setErro('Confirme que você é responsável legal pela criança ou tem autorização de um responsável.');
    setBusy(true);
    setErro('');
    try {
      const peso = num(f.peso);
      const r = await api.createBaby({ name: f.name.trim(), birth_date: f.birth_date, sex: f.sex ?? null, color: f.color, role: f.role, weight_g: peso ? Math.round(peso * 1000) : null, height_cm: num(f.altura), consult_date: f.consult_date, routine: semRotina ? null : rotina, guardian_consent: true });
      if (foto) await api.setBabyPhoto(r.id, foto).catch(() => undefined);
      onDone(r.id);
    } catch (x) { setErro(x instanceof Error ? x.message : 'Erro'); }
    setBusy(false);
  }
  async function entrar() {
    setBusy(true);
    setErro('');
    try { onDone((await api.acceptInvite(code, f.role)).babyId); } catch (x) { setErro(x instanceof Error ? x.message : 'Erro'); }
    setBusy(false);
  }

  return (
    <div className="auth">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="between"><div className="brand"><span className="logo">🪺</span> Ninho</div>{onCancel && <button className="btn sm ghost" onClick={onCancel}>Cancelar</button>}</div>
        <h1 style={{ marginTop: 14 }}>Olá, {userName.split(' ')[0]}!</h1>
        <p className="muted" style={{ marginBottom: 14 }}>Cadastre o bebê — ele é o centro de tudo. Depois você convida mãe, pai, avós, babá, tios e irmãos.</p>
        <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
          <button style={{ flex: 1 }} className={modo === 'novo' ? 'on' : ''} onClick={() => setModo('novo')}>Cadastrar bebê</button>
          <button style={{ flex: 1 }} className={modo === 'codigo' ? 'on' : ''} onClick={() => setModo('codigo')}>Tenho um código</button>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <Field label="Eu sou"><div className="choice">{PAPEIS.map((p) => <button key={p.id} className={f.role === p.id ? 'on' : ''} onClick={() => setF({ ...f, role: p.id })}>{p.emoji} {p.label}</button>)}</div></Field>

          {modo === 'codigo' ? (
            <>
              <Field label="Código de convite" hint="Peça o código a quem administra o perfil do bebê">
                <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ex.: K7P2QX" style={{ letterSpacing: 4, fontWeight: 800, textTransform: 'uppercase' }} maxLength={6} />
              </Field>
              {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
              <button className="btn primary block" disabled={busy || code.length < 6} onClick={entrar}>Entrar</button>
            </>
          ) : passo === 1 ? (
            <>
              <PhotoPicker photo={foto} emoji={f.sex === 'M' ? '👦' : f.sex === 'F' ? '👧' : '👶'} color={f.color} onPick={setFoto} onRemove={() => setFoto(null)} />
              <Field label="Nome do bebê"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex.: Helena" /></Field>
              <div className="grid g2">
                <Field label="Data de nascimento" hint={f.birth_date ? idade(f.birth_date).texto : undefined}><input className="input" type="date" value={f.birth_date} max={ymd(Date.now())} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
                <Field label="Sexo"><Choice value={f.sex} onChange={(v) => setF({ ...f, sex: v })} options={[{ v: 'F', l: 'Menina' }, { v: 'M', l: 'Menino' }]} /></Field>
              </div>
              <h3 style={{ marginTop: 4 }}>Última consulta</h3>
              <div className="grid g3">
                <Field label="Peso (kg)"><input className="input" inputMode="decimal" value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} placeholder="5,3" /></Field>
                <Field label="Altura (cm)"><input className="input" inputMode="decimal" value={f.altura} onChange={(e) => setF({ ...f, altura: e.target.value })} placeholder="58" /></Field>
                <Field label="Data"><input className="input" type="date" value={f.consult_date} onChange={(e) => setF({ ...f, consult_date: e.target.value })} /></Field>
              </div>
              {erro && <div className="chip bad">{erro}</div>}
              <button className="btn primary block" onClick={avancar}>Continuar: rotina</button>
            </>
          ) : (
            <>
              <p className="faint">Sugerimos uma rotina para {idade(f.birth_date).texto} — ajuste aos horários reais de {f.name.split(' ')[0]}. Dá para mudar depois.</p>
              {rotina && <RotinaEditor r={rotina} onChange={setRotina} />}
              <label className="check" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={responsavel} onChange={(e) => setResponsavel(e.target.checked)} />
                <span>Sou mãe, pai ou responsável legal por {f.name.split(' ')[0] || 'esta criança'} (ou tenho autorização de um deles) e autorizo o registro dos dados dela no Ninho, compartilhados só com os cuidadores que eu convidar.</span>
              </label>
              {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
              <div className="row">
                <button className="btn" onClick={() => setPasso(1)}>Voltar</button>
                <button className="btn ghost" onClick={() => criar(true)} disabled={busy || !responsavel}>Pular rotina</button>
                <button className="btn primary grow" onClick={() => criar()} disabled={busy || !responsavel}>{busy ? 'Criando…' : 'Concluir cadastro'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
