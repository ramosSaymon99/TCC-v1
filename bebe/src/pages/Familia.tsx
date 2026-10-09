import { useMemo, useState } from 'react';
import { Bell, Copy, Database, Download, KeyRound, LogOut, Pencil, Plus, Share2, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { Avatar, PhotoPicker } from '../components/Avatar';
import { PoliticaSheet } from '../components/Privacidade';
import { useApp } from '../ctx';
import { api, localCriarUsuarioDemo } from '../lib/api';
import { ACESSOS, CORES_BEBE, PAPEIS, papel } from '../lib/constants';
import { carregarExemplo } from '../lib/seed';
import { addDays, dataBr, haQuanto, idade, startOfDay, t } from '../lib/time';
import type { Access, Member, Routine } from '../types';
import { Choice, Field, Sheet } from '../components/ui';

export function Familia() {
  const app = useApp();
  const { data, user, podeAdmin, agora, act, babies, trocarBebe, novoBebe, modo, sair } = app;
  const { baby } = data;
  const [editBebe, setEditBebe] = useState(false);
  const [editRotina, setEditRotina] = useState(false);
  const [convite, setConvite] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const [membro, setMembro] = useState<Member | null>(null);
  const [excluir, setExcluir] = useState(false);
  const [politica, setPolitica] = useState(false);
  const id = idade(baby.birth_date, agora);

  // Contribuição de cada cuidador nos últimos 7 dias
  const contrib = useMemo(() => {
    const de = addDays(startOfDay(agora), -6);
    const m: Record<string, { total: number; mamadas: number; fraldas: number; sonos: number; ultimo: number }> = {};
    for (const e of data.events) {
      const ini = t(e.start_at);
      const c = (m[e.user_id] ??= { total: 0, mamadas: 0, fraldas: 0, sonos: 0, ultimo: 0 });
      c.ultimo = Math.max(c.ultimo, ini);
      if (ini < de) continue;
      c.total++;
      if (e.type === 'mamada' || e.type === 'mamadeira') c.mamadas++;
      if (e.type === 'fralda') c.fraldas++;
      if (e.type === 'sono') c.sonos++;
    }
    return m;
  }, [data.events, agora]);
  const soma = Object.values(contrib).reduce((a, c) => a + c.total, 0);

  async function carregarDemo() {
    if (!confirm(`Carregar 5 semanas de dados de exemplo em ${baby.name}? Eles se somam aos registros existentes.`)) return;
    await act(() => carregarExemplo(data, user.id, modo), 'Dados de exemplo carregados');
  }

  return (
    <div className="page">
      <div><h1>Família</h1><p className="faint">O bebê é o centro: cada cuidador se vincula a ele com um papel e um nível de acesso</p></div>

      <div className="card">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <Avatar photo={baby.photo} emoji={baby.sex === 'M' ? '👦' : baby.sex === 'F' ? '👧' : '👶'} color={baby.color || 'var(--brand)'} size={72} ring />
          <div className="grow">
            <h2 style={{ fontSize: 20 }}>{baby.name}</h2>
            <p className="muted">{id.texto} · nasceu em {dataBr(baby.birth_date)}</p>
            <div className="wrap-row" style={{ marginTop: 8 }}>
              <span className="chip brand">{data.members.length} cuidador(es)</span>
              <span className="chip">{papel(data.role).emoji} Você é {papel(data.role).label.toLowerCase()} · {ACESSOS[data.access].label.toLowerCase()}</span>
            </div>
          </div>
          {podeAdmin && <button className="icon-btn" onClick={() => setEditBebe(true)} aria-label="Editar bebê"><Pencil size={16} /></button>}
        </div>
        {baby.notes && <p className="muted" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>📝 {baby.notes}</p>}
        {babies.length > 1 && (
          <div className="wrap-row" style={{ marginTop: 14 }}>
            {babies.filter((b) => b.id !== baby.id).map((b) => <button key={b.id} className="btn sm" onClick={() => trocarBebe(b.id)}>Ver {b.name.split(' ')[0]}</button>)}
          </div>
        )}
        <div className="wrap-row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={novoBebe}><Plus size={14} /> Outro bebê / entrar com código</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Rotina planejada</h2>{podeAdmin && <button className="btn sm" onClick={() => setEditRotina(true)}><Pencil size={14} /> Editar</button>}</div>
        {baby.routine && (baby.routine.feeds?.length || baby.routine.naps?.length) ? (
          <div className="stack">
            <div className="row faint" style={{ gap: 14, flexWrap: 'wrap' }}><span>☀️ Acorda {baby.routine.wake || '—'}</span><span>🌙 Dorme {baby.routine.bedtime || '—'}</span>{baby.routine.feedIntervalMin && <span>⏱️ Mamar a cada até {Math.round(baby.routine.feedIntervalMin / 6) / 10} h</span>}</div>
            <div className="wrap-row">{baby.routine.feeds.map((h) => <span key={`f${h}`} className="chip" style={{ background: '#E0708A1a' }}>🍼 {h}</span>)}</div>
            <div className="wrap-row">{baby.routine.naps.map((h) => <span key={`n${h}`} className="chip" style={{ background: '#6B78D61a' }}>😴 {h}</span>)}</div>
          </div>
        ) : <p className="muted">Ainda sem rotina. Defina os horários de mamadas e sonecas para o app medir quanto da rotina está sendo cumprida.</p>}
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Cuidadores</h2>
          {podeAdmin && <button className="btn sm primary" onClick={() => setConvite(true)}><UserPlus size={14} /> Convidar</button>}
        </div>
        <p className="faint" style={{ marginBottom: 6 }}>Participação nos registros dos últimos 7 dias</p>
        {data.members.map((m) => {
          const c = contrib[m.user_id];
          const share = soma && c ? c.total / soma : 0;
          return (
            <div key={m.user_id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <Avatar photo={m.photo} emoji={papel(m.role).emoji} size={44} />
              <div className="grow">
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <b>{m.name}{m.user_id === user.id ? ' (você)' : ''}</b>
                  <span className="chip">{papel(m.role).label}</span>
                  <span className={`chip ${m.access === 'admin' ? 'brand' : m.access === 'leitor' ? '' : 'info'}`}>{ACESSOS[m.access].label}</span>
                </div>
                <div className="faint">{c?.total ? `${c.total} registros · ${c.mamadas} mamadas · ${c.fraldas} fraldas · ${c.sonos} sonos` : 'Sem registros na semana'}{c?.ultimo ? ` · último ${haQuanto(c.ultimo, agora)}` : ''}</div>
                {soma > 0 && <div className="hbar" style={{ marginTop: 6 }}><div className="track"><div className="fill" style={{ width: `${share * 100}%`, background: 'var(--brand)' }} /></div><span className="num faint" style={{ width: 36, textAlign: 'right' }}>{Math.round(share * 100)}%</span></div>}
              </div>
              {(podeAdmin || m.user_id === user.id) && <button className="icon-btn" onClick={() => setMembro(m)} aria-label="Editar vínculo"><Pencil size={15} /></button>}
            </div>
          );
        })}
      </div>

      <div className="grid md2">
        <div className="card stack">
          <h2>Meu perfil</h2>
          <div className="row"><Avatar photo={user.photo} emoji={papel(data.role).emoji} size={48} /><p className="muted">{user.name}<br />{user.email}</p></div>
          <div className="wrap-row">
            <button className="btn sm" onClick={() => setPerfil(true)}><Pencil size={14} /> Nome e senha</button>
            <button className="btn sm" onClick={sair}><LogOut size={14} /> Sair</button>
          </div>
          <hr className="sep" />
          <div className="wrap-row">
            <button className="btn sm ghost" onClick={() => setPolitica(true)}><Shield size={14} /> Privacidade e termos</button>
            <button className="btn sm ghost danger" onClick={() => setExcluir(true)}><Trash2 size={14} /> Excluir minha conta</button>
          </div>
        </div>
        <div className="card stack">
          <h2>Notificações</h2>
          <p className="muted">Avisos no celular de mamada atrasada, recados, materiais acabando, consultas e novos cuidadores.</p>
          <div className="wrap-row"><button className="btn sm primary" onClick={app.abrirConfigNotif}><Bell size={14} /> Configurar notificações</button></div>
        </div>
        <div className="card stack">
          <h2>Dados</h2>
          <p className="muted row" style={{ gap: 6 }}><Database size={15} /> {modo === 'cloud' ? 'Banco Cloudflare D1 — sincronizado entre todos os cuidadores' : 'Modo local — dados apenas neste navegador'}</p>
          {podeAdmin && (
            <div className="wrap-row">
              <button className="btn sm" onClick={() => act(async () => {
                const blob = await api.exportBaby(baby.id);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `ninho-${baby.name.split(' ')[0].toLowerCase()}-dados.json`;
                a.click();
              }, 'Exportação gerada')}><Download size={14} /> Exportar dados (JSON)</button>
              <button className="btn sm" onClick={carregarDemo}>Carregar dados de exemplo</button>
              <button className="btn sm danger" onClick={() => confirm(`Excluir ${baby.name} e TODOS os registros? Não dá para desfazer.`) && act(async () => { await api.deleteBaby(baby.id); await app.reloadMe(); }, 'Bebê excluído')}><Trash2 size={14} /> Excluir bebê</button>
            </div>
          )}
        </div>
      </div>

      {editBebe && <BebeSheet onClose={() => setEditBebe(false)} />}
      {editRotina && <RotinaSheet onClose={() => setEditRotina(false)} />}
      {convite && <ConviteSheet onClose={() => setConvite(false)} />}
      {perfil && <PerfilSheet onClose={() => setPerfil(false)} />}
      {membro && <MembroSheet m={membro} onClose={() => setMembro(null)} />}
      {excluir && <ExcluirContaSheet onClose={() => setExcluir(false)} />}
      {politica && <PoliticaSheet onClose={() => setPolitica(false)} />}
    </div>
  );
}

function BebeSheet({ onClose }: { onClose: () => void }) {
  const { data, act, reloadMe } = useApp();
  const b = data.baby;
  const [f, setF] = useState({ name: b.name, birth_date: b.birth_date, sex: b.sex ?? null, color: b.color ?? CORES_BEBE[0], notes: b.notes ?? '' });
  return (
    <Sheet title="Perfil do bebê" onClose={onClose} footer={<button className="btn primary" onClick={async () => (await act(async () => { await api.updateBaby(b.id, f); await reloadMe(b.id); }, 'Perfil atualizado')) && onClose()}>Salvar</button>}>
      <PhotoPicker
        photo={b.photo} emoji={f.sex === 'M' ? '👦' : f.sex === 'F' ? '👧' : '👶'} color={f.color}
        onPick={(foto) => act(async () => { await api.setBabyPhoto(b.id, foto); await reloadMe(b.id); }, 'Foto atualizada 📸')}
        onRemove={() => act(async () => { await api.removeBabyPhoto(b.id); await reloadMe(b.id); }, 'Foto removida')}
      />
      <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Data de nascimento"><input className="input" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
      <Field label="Sexo"><Choice value={f.sex ?? undefined} onChange={(v) => setF({ ...f, sex: v })} options={[{ v: 'F', l: 'Menina' }, { v: 'M', l: 'Menino' }]} /></Field>
      <Field label="Cor do perfil"><div className="choice">{CORES_BEBE.map((c) => <button key={c} className={f.color === c ? 'on' : ''} onClick={() => setF({ ...f, color: c })} style={{ width: 42, padding: 0 }}><span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 10, background: c }} /></button>)}</div></Field>
      <Field label="Observações (alergias, cuidados especiais)"><textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}

export function RotinaEditor({ r, onChange }: { r: Routine; onChange: (r: Routine) => void }) {
  const lista = (k: 'feeds' | 'naps', label: string, emoji: string) => (
    <Field label={`${emoji} ${label}`}>
      <div className="wrap-row">
        {r[k].map((h, i) => (
          <span key={i} className="row" style={{ gap: 2 }}>
            <input className="input" type="time" value={h} style={{ width: 112, minHeight: 38, padding: '4px 8px' }} onChange={(e) => onChange({ ...r, [k]: r[k].map((x, j) => (j === i ? e.target.value : x)) })} />
            <button className="btn sm ghost" onClick={() => onChange({ ...r, [k]: r[k].filter((_, j) => j !== i) })} aria-label="Remover"><X size={14} /></button>
          </span>
        ))}
        <button className="btn sm" onClick={() => onChange({ ...r, [k]: [...r[k], r[k].length ? r[k][r[k].length - 1] : '09:00'] })}><Plus size={14} /> Horário</button>
      </div>
    </Field>
  );
  return (
    <>
      <div className="grid g2">
        <Field label="☀️ Acorda"><input className="input" type="time" value={r.wake ?? ''} onChange={(e) => onChange({ ...r, wake: e.target.value })} /></Field>
        <Field label="🌙 Hora de dormir"><input className="input" type="time" value={r.bedtime ?? ''} onChange={(e) => onChange({ ...r, bedtime: e.target.value })} /></Field>
      </div>
      {lista('feeds', 'Mamadas / refeições', '🍼')}
      {lista('naps', 'Sonecas', '😴')}
      <Field label="Intervalo máximo entre mamadas (horas)" hint="Usado para alertar quando passar do tempo">
        <input className="input" type="number" step="0.5" min={1} value={r.feedIntervalMin ? r.feedIntervalMin / 60 : ''} onChange={(e) => onChange({ ...r, feedIntervalMin: e.target.value ? Number(e.target.value) * 60 : undefined })} />
      </Field>
    </>
  );
}

function RotinaSheet({ onClose }: { onClose: () => void }) {
  const { data, act } = useApp();
  const [r, setR] = useState<Routine>(data.baby.routine ?? { wake: '07:00', bedtime: '19:30', feeds: [], naps: [] });
  const ordenar = (x: Routine): Routine => ({ ...x, feeds: [...new Set(x.feeds)].sort(), naps: [...new Set(x.naps)].sort() });
  return (
    <Sheet title="Rotina planejada" onClose={onClose} footer={<button className="btn primary" onClick={async () => (await act(() => api.updateBaby(data.baby.id, { routine: ordenar(r) }), 'Rotina salva')) && onClose()}>Salvar</button>}>
      <p className="faint">Todos os cuidadores verão a rotina no Hoje. O app compara cada horário com o que foi registrado (tolerância de 45 min).</p>
      <RotinaEditor r={r} onChange={setR} />
    </Sheet>
  );
}

function ConviteSheet({ onClose }: { onClose: () => void }) {
  const { data, act, modo, refresh } = useApp();
  const [role, setRole] = useState('pai');
  const [access, setAccess] = useState<Access>('editor');
  const [cod, setCod] = useState<{ code: string; expires_at: string } | null>(null);
  const [nomeDemo, setNomeDemo] = useState('');
  const texto = cod ? `Oi! Você foi convidado(a) para acompanhar a rotina de ${data.baby.name.split(' ')[0]} no app Ninho 👶\n\nToque no link para entrar (o convite já vem preenchido): ${location.origin}${location.pathname}?convite=${cod.code}\n\nSe pedir, o código de convite é ${cod.code} (vale 7 dias). Crie sua conta com seu e-mail e senha.` : '';
  async function gerar() {
    await act(async () => setCod(await api.invite(data.baby.id, role, access)));
  }
  return (
    <Sheet title="Convidar cuidador" onClose={onClose}>
      <Field label="Quem é"><div className="choice">{PAPEIS.map((p) => <button key={p.id} className={role === p.id ? 'on' : ''} onClick={() => setRole(p.id)}>{p.emoji} {p.label}</button>)}</div></Field>
      <Field label="Acesso">
        <div className="stack">
          {(Object.keys(ACESSOS) as Access[]).map((a) => (
            <label key={a} className="row" style={{ gap: 10, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="radio" checked={access === a} onChange={() => setAccess(a)} style={{ width: 18, height: 18 }} />
              <span><b>{ACESSOS[a].label}</b> <span className="faint">— {ACESSOS[a].desc}</span></span>
            </label>
          ))}
        </div>
      </Field>
      {!cod ? <button className="btn primary block" onClick={gerar}>Gerar código de convite</button> : (
        <div className="card" style={{ textAlign: 'center', background: 'var(--brand-soft)', borderColor: 'transparent' }}>
          <p className="faint">Código válido por 7 dias, uso único</p>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 6, color: 'var(--brand-ink)' }}>{cod.code}</div>
          <p className="faint" style={{ marginBottom: 10 }}>Envie pelo WhatsApp: a mensagem leva um link que já abre o app com o convite. A pessoa só cria a conta (ou entra) e já cai na família.</p>
          <div className="wrap-row" style={{ justifyContent: 'center' }}>
            <button className="btn sm" onClick={() => navigator.clipboard?.writeText(texto)}><Copy size={14} /> Copiar</button>
            <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><Share2 size={14} /> WhatsApp</a>
          </div>
        </div>
      )}
      {modo === 'local' && (
        <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <p className="faint">No modo local os outros cuidadores não acessam de outro aparelho. Para testar, crie um cuidador de demonstração:</p>
          <div className="row"><input className="input" placeholder="Nome" value={nomeDemo} onChange={(e) => setNomeDemo(e.target.value)} /><button className="btn" disabled={!nomeDemo.trim()} onClick={async () => { localCriarUsuarioDemo(data.baby.id, nomeDemo.trim(), role); await refresh(); onClose(); }}>Adicionar</button></div>
        </div>
      )}
    </Sheet>
  );
}

function MembroSheet({ m, onClose }: { m: Member; onClose: () => void }) {
  const { data, act, user, podeAdmin, reloadMe } = useApp();
  const [role, setRole] = useState(m.role);
  const [access, setAccess] = useState<Access>(m.access);
  const eu = m.user_id === user.id;
  const [codigo, setCodigo] = useState<{ code: string; email: string } | null>(null);
  return (
    <Sheet title={<span className="row"><Avatar photo={m.photo} emoji={papel(m.role).emoji} size={36} /> {m.name}</span>} onClose={onClose} footer={<>
      <button className="btn danger" onClick={async () => confirm(eu ? `Deixar de acompanhar ${data.baby.name}?` : `Remover ${m.name}?`) && (await act(async () => { await api.removeMember(data.baby.id, m.user_id); if (eu) await reloadMe(); }, eu ? 'Você saiu' : 'Cuidador removido')) && onClose()}>{eu ? 'Sair do bebê' : 'Remover'}</button>
      <button className="btn primary" onClick={async () => (await act(() => api.updateMember(data.baby.id, m.user_id, podeAdmin ? { role, access } : { role }), 'Vínculo atualizado')) && onClose()}>Salvar</button>
    </>}>
      <p className="faint">{m.email} · desde {dataBr(m.created_at)}</p>
      <Field label="Papel"><div className="choice">{PAPEIS.map((p) => <button key={p.id} className={role === p.id ? 'on' : ''} onClick={() => setRole(p.id)}>{p.emoji} {p.label}</button>)}</div></Field>
      {podeAdmin && <Field label="Acesso"><Choice value={access} onChange={setAccess} options={(Object.keys(ACESSOS) as Access[]).map((a) => ({ v: a, l: ACESSOS[a].label }))} /></Field>}
      {podeAdmin && !eu && m.access !== 'admin' && (
        <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <b>Esqueceu a senha?</b>
          <p className="faint" style={{ margin: '4px 0 10px' }}>Gere um código e passe para {m.name.split(' ')[0]} pessoalmente ou por mensagem. Na tela de entrada: Entrar → "Tenho um código de senha". Vale 30 minutos, uma vez.</p>
          {codigo ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 5, color: 'var(--brand-ink)' }}>{codigo.code}</div>
              <p className="faint">para {codigo.email}</p>
            </div>
          ) : (
            <button className="btn sm" onClick={() => act(async () => { const r = await api.resetCode(data.baby.id, m.user_id); setCodigo(r); })}><KeyRound size={14} /> Gerar código de senha</button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PerfilSheet({ onClose }: { onClose: () => void }) {
  const { user, act, reloadMe, data } = useApp();
  const [name, setName] = useState(user.name);
  const [senha, setSenha] = useState('');
  const [nova, setNova] = useState('');
  return (
    <Sheet title="Meu perfil" onClose={onClose} footer={<button className="btn primary" onClick={async () => (await act(async () => { await api.updateMe({ name, ...(nova ? { password: senha, newPassword: nova } : {}) }); await reloadMe(); }, 'Perfil atualizado')) && onClose()}>Salvar</button>}>
      <PhotoPicker
        photo={user.photo} emoji={papel(data.role).emoji}
        onPick={(foto) => act(async () => { await api.setMyPhoto(foto); await reloadMe(); }, 'Sua foto foi atualizada 📸')}
        onRemove={() => act(async () => { await api.removeMyPhoto(); await reloadMe(); }, 'Foto removida')}
      />
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid g2">
        <Field label="Senha atual"><input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Nova senha"><input className="input" type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" placeholder="mín. 6 caracteres" /></Field>
      </div>
    </Sheet>
  );
}


function ExcluirContaSheet({ onClose }: { onClose: () => void }) {
  const { user, babies, toast, sair } = useApp();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [busy, setBusy] = useState(false);
  const sozinho = babies.length;
  async function excluir() {
    setBusy(true);
    try {
      const r = await api.deleteMe(senha);
      toast(`Conta excluída.${r.bebesApagados ? ` ${r.bebesApagados} perfil(is) de bebê apagado(s).` : ''}`);
      sair();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível excluir.');
    }
    setBusy(false);
  }
  return (
    <Sheet title="Excluir minha conta" onClose={onClose} footer={<button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={busy || confirma.trim().toUpperCase() !== 'EXCLUIR' || (!user.demo && senha.length < 1)} onClick={excluir}>{busy ? 'Excluindo…' : 'Excluir definitivamente'}</button>}>
      <p className="muted">Isto apaga <b>definitivamente</b> seu nome, e-mail, senha, foto, aparelhos e preferências de notificação.</p>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Bebês em que <b>só você</b> é cuidador: o perfil e todo o histórico também são apagados.</li>
        <li>Bebês compartilhados: o histórico continua com a família (seus registros aparecem como "ex-cuidador"). Se você for o único administrador, a administração passa para o cuidador mais antigo.</li>
      </ul>
      <p className="faint">Você acompanha {sozinho} bebê(s). Dica: antes, use "Exportar dados (JSON)" se quiser guardar uma cópia.</p>
      {!user.demo && <Field label="Sua senha"><input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" /></Field>}
      <Field label='Digite EXCLUIR para confirmar'><input className="input" value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Field>
    </Sheet>
  );
}
