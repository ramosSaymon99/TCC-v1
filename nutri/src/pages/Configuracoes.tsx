import { useRef, useState, type FormEvent } from 'react';
import { Download, RotateCcw, Save, Upload } from 'lucide-react';
import { useStore } from '../store/Store';
import { Confirm, PageHeader } from '../components/ui';
import { Field, toNumber } from '../components/fields';
import { TIPOS_CONSULTA, type Config, type Database } from '../types';
import { addDays, money, today } from '../utils/format';
import { faturamento } from '../utils/metrics';
import { CONFIG_PADRAO, VERSAO } from '../store/seed';

export default function Configuracoes() {
  const { db, setConfig, replaceDb, resetDemo, toast } = useStore();
  const [f, setF] = useState<Config>(db.config);
  const [reset, setReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setF((x) => ({ ...x, [k]: v }));
  const media3m = faturamento(db, addDays(today(), -90), today()).total / 3;

  const salvar = (e: FormEvent) => { e.preventDefault(); setConfig(f); toast('Configurações salvas.'); };

  const exportar = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nutrigest-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importar = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const arq = ev.target.files?.[0];
    if (!arq) return;
    try {
      const novo = JSON.parse(await arq.text()) as Database;
      if (novo.versao !== VERSAO || !Array.isArray(novo.pacientes) || !novo.config) throw new Error();
      replaceDb(novo); setF(novo.config);
      toast('Backup restaurado.');
    } catch { toast('Arquivo inválido para o NutriGest.', 'error'); }
    ev.target.value = '';
  };

  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados do consultório, preços, capacidade de atendimento e backup" />
      <form className="grid g-2" onSubmit={salvar}>
        <div className="card card-pad">
          <h3 style={{ fontSize: 14.5, marginBottom: 14 }}>Profissional</h3>
          <div className="form-grid">
            <Field label="Nome" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
            <Field label="CRN"><input className="input" value={f.crn} onChange={(e) => set('crn', e.target.value)} /></Field>
            <Field label="Telefone"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
            <Field label="E-mail" full><input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Endereço" full><input className="input" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></Field>
          </div>
          <div className="divider" />
          <h3 style={{ fontSize: 14.5, marginBottom: 14 }}>Metas e capacidade</h3>
          <div className="form-grid">
            <Field label="Meta de faturamento mensal (R$)" hint={`Média dos últimos 3 meses: ${money(media3m)}`}><input className="input" inputMode="decimal" value={f.metaMensal} onChange={(e) => set('metaMensal', toNumber(e.target.value))} /></Field>
            <Field label="Intervalo de retorno (dias)" hint="Após esse prazo sem consulta o paciente entra em “retorno vencido”."><input className="input" inputMode="numeric" value={f.retornoDias} onChange={(e) => set('retornoDias', toNumber(e.target.value))} /></Field>
            <Field label="Horas de atendimento por dia"><input className="input" inputMode="numeric" value={f.horasDia} onChange={(e) => set('horasDia', toNumber(e.target.value))} /></Field>
            <Field label="Dias de atendimento por semana"><select className="select" value={f.diasSemana} onChange={(e) => set('diasSemana', toNumber(e.target.value))}><option value={5}>Segunda a sexta</option><option value={6}>Segunda a sábado</option></select></Field>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontSize: 14.5, marginBottom: 14 }}>Preços e duração dos atendimentos</h3>
          <table className="table table-compact">
            <thead><tr><th>Tipo</th><th className="num">Preço (R$)</th><th className="num">Duração (min)</th><th className="num">R$/hora</th></tr></thead>
            <tbody>
              {TIPOS_CONSULTA.map((t) => (
                <tr key={t}>
                  <td className="strong">{t}</td>
                  <td className="num"><input className="input" style={{ width: 100, textAlign: 'right' }} inputMode="decimal" value={f.precos[t]} onChange={(e) => set('precos', { ...f.precos, [t]: toNumber(e.target.value) })} /></td>
                  <td className="num"><input className="input" style={{ width: 80, textAlign: 'right' }} inputMode="numeric" value={f.duracoes[t]} onChange={(e) => set('duracoes', { ...f.duracoes, [t]: toNumber(e.target.value) })} /></td>
                  <td className="num">{f.duracoes[t] ? money((f.precos[t] / f.duracoes[t]) * 60) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">O valor por hora ajuda a decidir quais atendimentos priorizar quando a agenda está cheia.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit"><Save size={16} /> Salvar configurações</button></div>
          <div className="divider" />
          <h3 style={{ fontSize: 14.5, marginBottom: 6 }}>Backup e dados</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Os dados ficam apenas neste navegador. Exporte um backup com frequência — ele contém dados de saúde dos pacientes (LGPD): guarde em local seguro.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={exportar}><Download size={16} /> Exportar backup</button>
            <button type="button" className="btn" onClick={() => file.current?.click()}><Upload size={16} /> Restaurar backup</button>
            <button type="button" className="btn" onClick={() => setReset(true)}><RotateCcw size={16} /> Restaurar demonstração</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={importar} />
          </div>
        </div>
      </form>
      {reset && <Confirm label="Restaurar" text="Substituir todos os dados atuais pelos dados de demonstração? Exporte um backup antes se quiser manter os dados." onClose={() => setReset(false)} onConfirm={() => { resetDemo(); setF(CONFIG_PADRAO); toast('Dados de demonstração restaurados.'); }} />}
    </>
  );
}
