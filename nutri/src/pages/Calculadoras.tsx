import { useState } from 'react';
import { PageHeader, Badge } from '../components/ui';
import { Field, Options, toNumber } from '../components/fields';
import { ATIVIDADES, OBJETIVOS, type NivelAtividade, type Objetivo, type Sexo } from '../types';
import { AJUSTE_OBJETIVO, FATOR_ATIVIDADE, cinturaRisco, classeImc, imc, pesoSaudavel, rcqRisco, tmbHarris, tmbMifflin } from '../utils/nutri';

const f0 = (n: number) => Math.round(n).toLocaleString('pt-BR');
const f1 = (n: number) => n.toFixed(1).replace('.', ',');

/** Calculadora rápida para consulta ou triagem, sem precisar cadastrar o paciente. */
export default function Calculadoras() {
  const [sexo, setSexo] = useState<Sexo>('F');
  const [anos, setAnos] = useState(35);
  const [peso, setPeso] = useState(72);
  const [altura, setAltura] = useState(165);
  const [atividade, setAtividade] = useState<NivelAtividade>('Leve');
  const [objetivo, setObjetivo] = useState<Objetivo>('Emagrecimento');
  const [cintura, setCintura] = useState(0);
  const [quadril, setQuadril] = useState(0);

  const v = imc(peso, altura);
  const cls = classeImc(v);
  const [sMin, sMax] = pesoSaudavel(altura);
  const mif = tmbMifflin(sexo, peso, altura, anos);
  const har = tmbHarris(sexo, peso, altura, anos);
  const fa = FATOR_ATIVIDADE[atividade];
  const aj = AJUSTE_OBJETIVO[objetivo];
  const kcal = mif * fa * (1 + aj.kcal);
  const prot = aj.protKg * peso;
  const gord = (kcal * aj.gordPct) / 9;
  const carb = Math.max(0, (kcal - prot * 4 - gord * 9) / 4);
  const rcq = rcqRisco(sexo, cintura, quadril);
  const cint = cinturaRisco(sexo, cintura);

  return (
    <>
      <PageHeader title="Calculadoras" subtitle="IMC, gasto energético e distribuição de macronutrientes — estimativas de partida, a conduta é sempre da nutricionista" />
      <div className="grid g-3-2">
        <div className="card card-pad">
          <div className="form-grid">
            <Field label="Sexo"><select className="select" value={sexo} onChange={(e) => setSexo(e.target.value as Sexo)}><option value="F">Feminino</option><option value="M">Masculino</option></select></Field>
            <Field label="Idade (anos)"><input className="input" inputMode="numeric" value={anos} onChange={(e) => setAnos(toNumber(e.target.value))} /></Field>
            <Field label="Peso (kg)"><input className="input" inputMode="decimal" value={peso} onChange={(e) => setPeso(toNumber(e.target.value))} /></Field>
            <Field label="Altura (cm)"><input className="input" inputMode="numeric" value={altura} onChange={(e) => setAltura(toNumber(e.target.value))} /></Field>
            <Field label="Atividade física" hint={`Fator ${String(fa).replace('.', ',')}`}><select className="select" value={atividade} onChange={(e) => setAtividade(e.target.value as NivelAtividade)}><Options items={ATIVIDADES} /></select></Field>
            <Field label="Objetivo" hint={`${aj.kcal > 0 ? '+' : ''}${Math.round(aj.kcal * 100)}% kcal · ${String(aj.protKg).replace('.', ',')} g/kg de proteína`}><select className="select" value={objetivo} onChange={(e) => setObjetivo(e.target.value as Objetivo)}><Options items={OBJETIVOS} /></select></Field>
            <Field label="Cintura (cm)"><input className="input" inputMode="decimal" value={cintura || ''} onChange={(e) => setCintura(toNumber(e.target.value))} /></Field>
            <Field label="Quadril (cm)"><input className="input" inputMode="decimal" value={quadril || ''} onChange={(e) => setQuadril(toNumber(e.target.value))} /></Field>
          </div>
        </div>
        <div className="card card-pad">
          <div className="stat-mini" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><span>IMC</span><b>{v ? f1(v) : '—'}</b><Badge tone={cls.tone}>{cls.label}</Badge></div>
            <div><span>Peso para IMC saudável</span><b>{f0(sMin)}–{f0(sMax)} kg</b></div>
            <div><span>TMB Mifflin-St Jeor</span><b>{f0(mif)} kcal</b></div>
            <div><span>TMB Harris-Benedict</span><b>{f0(har)} kcal</b></div>
            <div><span>Gasto energético total</span><b>{f0(mif * fa)} kcal</b></div>
            <div><span>Meta para {objetivo.toLowerCase()}</span><b className="text-success">{f0(kcal)} kcal</b></div>
            <div><span>Água</span><b>{f1(peso * 0.035)} L/dia</b></div>
            <div><span>Relação cintura/quadril</span><b>{rcq ? rcq.valor.toFixed(2).replace('.', ',') : '—'}</b>{rcq && <Badge tone={rcq.elevado ? 'red' : 'green'}>{rcq.elevado ? 'Risco elevado' : 'Adequada'}</Badge>}{cint && <Badge tone={cint.tone}>Cintura: {cint.label}</Badge>}</div>
          </div>
          <div className="divider" />
          <div className="strong" style={{ marginBottom: 8 }}>Distribuição sugerida</div>
          <table className="table table-compact">
            <thead><tr><th>Macronutriente</th><th className="num">g/dia</th><th className="num">g/kg</th><th className="num">% kcal</th></tr></thead>
            <tbody>
              <tr><td>Proteína</td><td className="num">{f0(prot)}</td><td className="num">{f1(prot / peso)}</td><td className="num">{f0((prot * 400) / kcal)}%</td></tr>
              <tr><td>Carboidrato</td><td className="num">{f0(carb)}</td><td className="num">{f1(carb / peso)}</td><td className="num">{f0((carb * 400) / kcal)}%</td></tr>
              <tr><td>Gordura</td><td className="num">{f0(gord)}</td><td className="num">{f1(gord / peso)}</td><td className="num">{f0((gord * 900) / kcal)}%</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginBottom: 0 }}>Referências: Mifflin-St Jeor (1990), Harris-Benedict revisada (1984), OMS para IMC, cintura e RCQ. Gestantes, atletas e pacientes com patologias exigem ajustes específicos.</p>
        </div>
      </div>
    </>
  );
}
