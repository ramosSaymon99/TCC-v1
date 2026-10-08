import { useEffect, useState } from 'react';
import { api, getModo } from '../lib/api';
import { Field } from '../components/ui';
import { PoliticaSheet } from '../components/Privacidade';

type Tela = 'criar' | 'entrar' | 'esqueci' | 'codigo' | 'link';

/** Link do e-mail de redefinição: ?reset=<token> */
const tokenDaUrl = new URLSearchParams(location.search).get('reset');

export function Auth({ onOk, onDemo }: { onOk: () => void; onDemo: () => Promise<void> }) {
  const [tela, setTela] = useState<Tela>(tokenDaUrl ? 'link' : 'criar');
  const [f, setF] = useState({ name: '', email: '', password: '', code: '' });
  const [aceite, setAceite] = useState(false);
  const [politica, setPolitica] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailOn, setEmailOn] = useState<boolean | null>(null);

  useEffect(() => { api.authConfig().then((c) => setEmailOn(c.email)).catch(() => setEmailOn(false)); }, []);
  useEffect(() => { setErro(''); setAviso(''); }, [tela]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setAviso('');
    setBusy(true);
    try {
      if (tela === 'criar') {
        if (!aceite) throw new Error('Para criar a conta, aceite a Política de Privacidade e os Termos de Uso.');
        await api.signup(f.name, f.email, f.password, true);
        onOk();
      } else if (tela === 'entrar') {
        await api.login(f.email, f.password);
        onOk();
      } else if (tela === 'esqueci') {
        const r = await api.forgot(f.email);
        if (r.email) setAviso('Se este e-mail tiver conta, enviamos um link para criar uma nova senha. Confira também o spam. O link vale por 1 hora.');
        else setTela('codigo');
      } else if (tela === 'codigo') {
        await api.reset({ email: f.email, code: f.code, password: f.password });
        onOk();
      } else if (tela === 'link') {
        await api.reset({ token: tokenDaUrl!, password: f.password });
        history.replaceState(null, '', location.pathname);
        onOk();
      }
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  const titulo = { criar: 'Criar conta', entrar: 'Entrar', esqueci: 'Esqueci minha senha', codigo: 'Redefinir com código', link: 'Criar nova senha' }[tela];

  return (
    <div className="auth">
      <div className="card">
        <div className="brand" style={{ justifyContent: 'center', fontSize: 26 }}><span className="logo" style={{ width: 40, height: 40, fontSize: 22 }}>🪺</span> Ninho</div>
        <p className="muted" style={{ textAlign: 'center', margin: '8px 0 18px' }}>A rotina do bebê compartilhada por toda a família: mamadas, sonecas, fraldas, saúde e o mural de materiais.</p>

        {(tela === 'criar' || tela === 'entrar') ? (
          <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
            <button style={{ flex: 1 }} className={tela === 'criar' ? 'on' : ''} onClick={() => setTela('criar')}>Criar conta</button>
            <button style={{ flex: 1 }} className={tela === 'entrar' ? 'on' : ''} onClick={() => setTela('entrar')}>Entrar</button>
          </div>
        ) : (
          <div className="between" style={{ marginBottom: 12 }}>
            <h2>{titulo}</h2>
            <button className="btn sm ghost" onClick={() => { setTela('entrar'); if (tokenDaUrl) history.replaceState(null, '', location.pathname); }}>Voltar</button>
          </div>
        )}

        {tela === 'esqueci' && <p className="muted" style={{ marginBottom: 12 }}>{emailOn === false ? 'Peça a um administrador do bebê (ex.: mãe ou pai) um código de redefinição: Família → toque no seu nome → "Gerar código de senha".' : 'Informe o e-mail da conta. Vamos enviar um link para criar uma nova senha.'}</p>}
        {tela === 'codigo' && <p className="muted" style={{ marginBottom: 12 }}>Use o código de 8 caracteres que um administrador do bebê gerou para você (vale 30 minutos).</p>}

        <form className="stack" style={{ gap: 12 }} onSubmit={enviar}>
          {tela === 'criar' && <Field label="Seu nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required /></Field>}
          {tela !== 'link' && <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required /></Field>}
          {tela === 'codigo' && <Field label="Código"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={8} style={{ letterSpacing: 4, fontWeight: 800 }} required /></Field>}
          {tela !== 'esqueci' && (
            <Field label={tela === 'codigo' || tela === 'link' ? 'Nova senha' : 'Senha'}>
              <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={tela === 'entrar' ? 'current-password' : 'new-password'} placeholder={tela === 'entrar' ? '' : 'mínimo 6 caracteres'} required />
            </Field>
          )}
          {tela === 'criar' && (
            <label className="check">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              <span>Li e aceito a <button type="button" className="linkbtn" onClick={() => setPolitica(true)}>Política de Privacidade e os Termos de Uso</button>.</span>
            </label>
          )}
          {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
          {aviso && <div className="chip ok" style={{ whiteSpace: 'normal' }}>{aviso}</div>}
          {!(tela === 'esqueci' && emailOn === false) && (
            <button className="btn primary block" disabled={busy || (tela === 'criar' && !aceite)}>
              {busy ? 'Aguarde…' : { criar: 'Criar conta', entrar: 'Entrar', esqueci: 'Enviar link', codigo: 'Salvar nova senha e entrar', link: 'Salvar nova senha e entrar' }[tela]}
            </button>
          )}
        </form>

        {tela === 'entrar' && (
          <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="linkbtn" onClick={() => setTela('esqueci')}>Esqueci minha senha</button>
            <button className="linkbtn" onClick={() => setTela('codigo')}>Tenho um código</button>
          </div>
        )}
        {tela === 'esqueci' && emailOn === false && <button className="btn primary block" onClick={() => setTela('codigo')}>Já tenho o código</button>}

        {(tela === 'criar' || tela === 'entrar') && (
          <>
            <hr className="sep" style={{ margin: '18px 0 14px' }} />
            <button className="btn block" disabled={busy} onClick={async () => { setBusy(true); try { await onDemo(); } catch (x) { setErro(x instanceof Error ? x.message : 'Erro'); } setBusy(false); }}>✨ Explorar com uma família de exemplo</button>
            <p className="faint" style={{ textAlign: 'center', marginTop: 8 }}>Dados fictícios, apagados automaticamente em 24 h.</p>
          </>
        )}
        <p className="faint" style={{ textAlign: 'center', marginTop: 12 }}>
          {getModo() === 'cloud' ? '🔒 Dados no Cloudflare D1, senha criptografada.' : '💾 Modo local: os dados ficam neste navegador.'}{' '}
          <button className="linkbtn" onClick={() => setPolitica(true)}>Privacidade</button>
        </p>
      </div>
      {politica && <PoliticaSheet onClose={() => setPolitica(false)} />}
    </div>
  );
}
