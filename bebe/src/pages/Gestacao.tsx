import { useState } from 'react';
import { Baby as BabyIcon, CalendarPlus, UserPlus } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { DICAS_GESTACAO, MALA, idCheck, semanasGestacao } from '../lib/conteudo';
import { DIA, dataBr, t, ymd } from '../lib/time';
import { Empty, Field, Sheet } from '../components/ui';

/** Modo gestação: a família começa a usar o Ninho antes do nascimento. */
export function Gestacao() {
  const { data, agora, act, podeEditar, podeAdmin, setAba, user } = useApp();
  const { baby } = data;
  const primeiro = baby.name.split(' ')[0];
  const g = semanasGestacao(baby.birth_date, agora);
  const dica = DICAS_GESTACAO.find((d) => g.semanas <= d.ate) ?? DICAS_GESTACAO[DICAS_GESTACAO.length - 1];
  const [nasceu, setNasceu] = useState(false);
  const feitos = new Set(data.checks.filter((c) => c.kind === 'mala').map((c) => c.code));
  const consultas = data.appointments.filter((a) => !a.done && t(a.date) >= agora - DIA / 2).sort((a, b) => t(a.date) - t(b.date));
  const enxoval = data.supplies.filter((s) => s.category === 'Enxoval');
  const marcar = (code: string, on: boolean) => act(() => (on
    ? api.create('checks', baby.id, { id: idCheck(baby.id, 'mala', code), kind: 'mala', code, date: ymd(Date.now()) })
    : api.remove('checks', baby.id, data.checks.find((c) => c.kind === 'mala' && c.code === code)?.id ?? idCheck(baby.id, 'mala', code))));

  return (
    <div className="page">
      <div>
        <p className="faint">Olá, {user.name.split(' ')[0]} 💛</p>
        <h1>Esperando {primeiro}</h1>
      </div>

      <div className="card gest">
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <div style={{ fontSize: 46 }}>🤰</div>
          <div className="grow">
            <div className="gest-sem">{g.semanas} semanas{g.dias ? ` e ${g.dias} ${g.dias === 1 ? 'dia' : 'dias'}` : ''}</div>
            <div className="faint">{g.faltam > 0 ? `faltam ${g.faltam} dias · data prevista ${dataBr(baby.birth_date)}` : `data prevista: ${dataBr(baby.birth_date)} — chegou a hora!`} · {g.trimestre}º trimestre</div>
          </div>
        </div>
        <div className="barra-gest" aria-label={`${g.semanas} de 40 semanas`}><span style={{ width: `${Math.min(100, (g.semanas / 40) * 100)}%` }} /></div>
        <p style={{ marginTop: 10 }}>💡 {dica.texto}</p>
        {podeAdmin && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setNasceu(true)}><BabyIcon size={16} /> {primeiro} nasceu!</button>}
      </div>

      <div className="gest-grid">
        <div className="card">
          <div className="card-h"><h2>🧳 Mala da maternidade</h2><span className="faint">{feitos.size}/{MALA.length} prontos</span></div>
          {(['Bebê', 'Mãe', 'Documentos'] as const).map((grupo) => (
            <div key={grupo} style={{ marginBottom: 8 }}>
              <h3 style={{ margin: '6px 0' }}>{grupo}</h3>
              {MALA.filter((m) => m.grupo === grupo).map((m) => (
                <label key={m.code} className="list-item" style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                  <input type="checkbox" disabled={!podeEditar} checked={feitos.has(m.code)} onChange={(e) => marcar(m.code, e.target.checked)} style={{ width: 20, height: 20 }} />
                  <span style={{ textDecoration: feitos.has(m.code) ? 'line-through' : 'none', opacity: feitos.has(m.code) ? 0.6 : 1 }}>{m.nome}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-h"><h2>🩺 Pré-natal</h2><button className="btn sm" onClick={() => setAba('saude')}><CalendarPlus size={14} /> Consultas</button></div>
            {consultas.length ? consultas.slice(0, 4).map((a) => (
              <div key={a.id} className="list-item"><div className="grow"><b>{a.title}</b><div className="faint">{new Date(a.date).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}{a.doctor ? ` · ${a.doctor}` : ''}</div></div></div>
            )) : <Empty emoji="🗓️">Agende as consultas do pré-natal em Saúde → Consultas. A família recebe lembrete na véspera.</Empty>}
          </div>
          <div className="card">
            <div className="card-h"><h2>🛍️ Enxoval</h2><button className="btn sm" onClick={() => setAba('mural')}>Abrir Mural</button></div>
            <p className="faint">{enxoval.length ? `${enxoval.length} item(ns) na categoria Enxoval do Mural. Padrinhos e avós podem marcar “eu compro”.` : 'Monte a lista do enxoval no Mural (categoria Enxoval) e combine com a família quem compra o quê.'}</p>
          </div>
          <div className="card">
            <div className="card-h"><h2>👨‍👩‍👧 Família</h2><button className="btn sm" onClick={() => setAba('familia')}><UserPlus size={14} /> Convidar</button></div>
            <p className="faint">{data.members.length > 1 ? `${data.members.length} pessoas já acompanham ${primeiro}.` : 'Convide quem vai ajudar nos primeiros dias: assim, desde o primeiro dia de vida, todos registram e acompanham juntos.'}</p>
          </div>
        </div>
      </div>

      {nasceu && <NasceuSheet onClose={() => setNasceu(false)} />}
    </div>
  );
}

function NasceuSheet({ onClose }: { onClose: () => void }) {
  const { data, act, reloadMe } = useApp();
  const [f, setF] = useState({ date: ymd(Date.now()), peso: '', altura: '' });
  const num = (s: string) => (s ? Number(s.replace(',', '.')) : null);
  async function salvar() {
    const peso = num(f.peso);
    const ok = await act(async () => {
      await api.updateBaby(data.baby.id, { birth_date: f.date, settings: { gestacao: false, nasceu_em: f.date } });
      if (peso || num(f.altura)) await api.create('growth', data.baby.id, { date: f.date, weight_g: peso ? Math.round(peso * 1000) : null, height_cm: num(f.altura), source: 'consulta', note: 'Nascimento' });
      await reloadMe(data.baby.id);
    }, `Bem-vindo(a), ${data.baby.name.split(' ')[0]}! 🎉`);
    if (ok) onClose();
  }
  return (
    <Sheet title={`🎉 ${data.baby.name.split(' ')[0]} nasceu!`} onClose={onClose} footer={<button className="btn primary" onClick={salvar}>Começar a rotina</button>}>
      <p className="faint">A partir de agora o Ninho passa a acompanhar mamadas, sonecas, fraldas e saúde. Os testes do recém-nascido aparecem em Saúde.</p>
      <Field label="Data de nascimento"><input className="input" type="date" value={f.date} max={ymd(Date.now())} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Peso ao nascer (kg)"><input className="input" inputMode="decimal" value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} placeholder="ex.: 3,25" /></Field>
        <Field label="Comprimento (cm)"><input className="input" inputMode="decimal" value={f.altura} onChange={(e) => setF({ ...f, altura: e.target.value })} placeholder="ex.: 49" /></Field>
      </div>
    </Sheet>
  );
}
