import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useStore } from '../store/Store';
import { Logo } from '../components/ui';

export default function Login() {
  const { login } = useStore();
  const [enviando, setEnviando] = useState(false);
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const err = await login(email, senha);
    setEnviando(false);
    if (err) setErro(err);
    else nav('/');
  };

  return (
    <div className="login">
      <section className="login-hero">
        <div className="row" style={{ gap: 12, position: 'relative', zIndex: 1 }}>
          <Logo size={42} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Pivot Hub</div>
            <div style={{ color: '#7fa6e3', fontSize: 13 }}>Gestão Comercial</div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>Mais organização para o seu negócio.</h2>
          <p>Clientes, orçamentos, ordens de serviço, agenda e financeiro em um só lugar — com indicadores que mostram onde agir.</p>
        </div>
      </section>

      <section className="login-form">
        <form onSubmit={submit}>
          <div>
            <h1>Entrar</h1>
            <p className="muted" style={{ margin: '4px 0 0' }}>Acesse o painel de gestão.</p>
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" autoComplete="username" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input id="senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••" required />
          </div>
          {erro && <div className="error-text">{erro}</div>}
          <button className="btn btn-primary" style={{ height: 42 }} disabled={enviando}><LogIn size={16} /> {enviando ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <div className="assinatura-sistema assinatura-login">Powered by <span>Kaivo</span></div>
      </section>
    </div>
  );
}
