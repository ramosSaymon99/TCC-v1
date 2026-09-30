import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2, GraduationCap, Wrench, LogIn } from 'lucide-react';
import { useStore } from '../store/Store';
import { Logo } from '../components/ui';

export default function Login() {
  const { login, db } = useStore();
  const nav = useNavigate();
  const [email, setEmail] = useState('saymon@techgest.com');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = login(email, senha);
    if (err) setErro(err);
    else nav('/');
  };

  return (
    <div className="login">
      <section className="login-hero">
        <div className="row" style={{ gap: 12, position: 'relative', zIndex: 1 }}>
          <Logo size={42} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>TechGest</div>
            <div style={{ color: '#7fa6e3', fontSize: 13 }}>Gestão Comercial</div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>Mais organização para o seu negócio.</h2>
          <p>Clientes, orçamentos, ordens de serviço, agenda e financeiro em um só lugar — com indicadores que mostram onde agir.</p>
        </div>
        <div className="hero-services">
          <div><GraduationCap size={22} /><br />Treinamentos de Informática</div>
          <div><Wrench size={22} /><br />Implantação e Manutenção de Computadores</div>
          <div><Code2 size={22} /><br />Criação de Sites e Soluções Digitais</div>
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
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input id="senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••" required />
          </div>
          {erro && <div className="error-text">{erro}</div>}
          <button className="btn btn-primary" style={{ height: 42 }}><LogIn size={16} /> Entrar</button>
          <div className="demo-box">
            <strong>Ambiente de demonstração</strong> — senha <code>123456</code>. Entrar como:
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              {db.usuarios.filter((u) => u.status === 'Ativo').map((u) => (
                <button type="button" key={u.id} style={{ textAlign: 'left' }} onClick={() => { setEmail(u.email); setSenha('123456'); setErro(null); }}>
                  {u.nome} · {u.perfil}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
