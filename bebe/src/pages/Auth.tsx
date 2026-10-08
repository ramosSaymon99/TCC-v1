import { useState } from 'react';
import { api, getModo } from '../lib/api';
import { Field } from '../components/ui';

export function Auth({ onOk, onDemo }: { onOk: () => void; onDemo: () => Promise<void> }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('criar');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setBusy(true);
    try {
      if (modo === 'criar') await api.signup(f.name, f.email, f.password);
      else await api.login(f.email, f.password);
      onOk();
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <div className="card">
        <div className="brand" style={{ justifyContent: 'center', fontSize: 26 }}><span className="logo" style={{ width: 40, height: 40, fontSize: 22 }}>🪺</span> Ninho</div>
        <p className="muted" style={{ textAlign: 'center', margin: '8px 0 18px' }}>A rotina do bebê compartilhada por toda a família: mamadas, sonecas, fraldas, saúde e o mural de materiais.</p>
        <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
          <button style={{ flex: 1 }} className={modo === 'criar' ? 'on' : ''} onClick={() => setModo('criar')}>Criar conta</button>
          <button style={{ flex: 1 }} className={modo === 'entrar' ? 'on' : ''} onClick={() => setModo('entrar')}>Entrar</button>
        </div>
        <form className="stack" style={{ gap: 12 }} onSubmit={enviar}>
          {modo === 'criar' && <Field label="Seu nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required /></Field>}
          <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required /></Field>
          <Field label="Senha"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} placeholder={modo === 'criar' ? 'mínimo 6 caracteres' : ''} required /></Field>
          {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : modo === 'criar' ? 'Criar conta' : 'Entrar'}</button>
        </form>
        <hr className="sep" style={{ margin: '18px 0 14px' }} />
        <button className="btn block" disabled={busy} onClick={async () => { setBusy(true); try { await onDemo(); } catch (x) { setErro(x instanceof Error ? x.message : 'Erro'); } setBusy(false); }}>✨ Explorar com uma família de exemplo</button>
        <p className="faint" style={{ textAlign: 'center', marginTop: 12 }}>
          {getModo() === 'cloud' ? '🔒 Dados salvos no Cloudflare D1, com senha criptografada.' : '💾 Modo local: os dados ficam neste navegador.'}
        </p>
      </div>
    </div>
  );
}
