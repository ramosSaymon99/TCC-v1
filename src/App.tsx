import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Lock, Sparkles } from 'lucide-react';
import Layout from './components/Layout';
import { useStore } from './store/Store';
import type { Modulo } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Orcamentos from './pages/Orcamentos';
import Funil from './pages/Funil';
import Ordens from './pages/Ordens';
import Equipamentos from './pages/Equipamentos';
import Agenda from './pages/Agenda';
import Financeiro from './pages/Financeiro';
import Relatorios from './pages/Relatorios';
import Usuarios from './pages/Usuarios';
import Configuracoes from './pages/Configuracoes';
import Servicos from './pages/Servicos';
import Estoque from './pages/Estoque';
import Contratos from './pages/Contratos';
import Treinamentos from './pages/Treinamentos';
import Planejamento from './pages/Planejamento';
import SocialMedia from './pages/SocialMedia';
import ConsoleVisao from './pages/console/Visao';
import ConsoleAssinantes from './pages/console/Assinantes';
import ConsolePlanos from './pages/console/Planos';
import ConsoleFaturas from './pages/console/Faturas';
import { PlataformaProvider } from './store/PlataformaStore';
import { MODULOS } from './store/seed';
import { money } from './utils/format';

/** Módulo fora do plano: mostra o que o upgrade libera (e o custo) em vez de só bloquear. */
function Upgrade({ mod }: { mod: Modulo }) {
  const { assinatura, user } = useStore();
  const nome = MODULOS.find((m) => m.id === mod)?.label ?? mod;
  const atual = assinatura?.ofertas?.find((o) => o.nome === assinatura.plano);
  const alvo = assinatura?.ofertas?.find((o) => o.modulos.includes(mod) && (!atual || o.precoMensal > atual.precoMensal)) ?? assinatura?.ofertas?.find((o) => o.modulos.includes(mod));
  const ganha = alvo ? MODULOS.filter((m) => alvo.modulos.includes(m.id) && !assinatura?.modulos.includes(m.id)) : [];
  return (
    <div className="card empty" style={{ marginTop: 40, maxWidth: 620, marginInline: 'auto' }}>
      <Sparkles size={36} color="var(--primary)" />
      <h3 style={{ margin: '6px 0' }}>{nome} não está incluído no plano {assinatura?.plano}</h3>
      {alvo ? (
        <div style={{ maxWidth: 480 }}>
          Disponível no plano <strong>{alvo.nome}</strong> ({money(alvo.precoMensal)}/mês{atual ? `, +${money(alvo.precoMensal - atual.precoMensal)} em relação ao seu plano` : ''}), que também libera {ganha.map((m) => m.label).join(', ')} e até {alvo.maxUsuarios} usuários.
        </div>
      ) : <div>Fale com o comercial Pivot Hub para liberar este módulo.</div>}
      <div className="small muted" style={{ marginTop: 10 }}>
        {user?.perfil === 'Proprietário' ? 'Para fazer o upgrade, fale com o comercial Pivot Hub: o módulo é liberado na hora, sem perder dados.' : 'Peça ao proprietário da empresa para avaliar o upgrade.'}
      </div>
    </div>
  );
}

function Guard({ mod, children }: { mod: Modulo; children: ReactNode }) {
  const { can, liberado } = useStore();
  if (!liberado(mod)) return <Upgrade mod={mod} />;
  if (!can(mod)) {
    return (
      <div className="card empty" style={{ marginTop: 40 }}>
        <Lock size={36} />
        <h3 style={{ margin: '6px 0' }}>Acesso restrito</h3>
        <div>Seu perfil não tem permissão para este módulo. Solicite acesso ao proprietário.</div>
      </div>
    );
  }
  return <>{children}</>;
}

function AreaConsole() {
  const { adminPlataforma } = useStore();
  if (!adminPlataforma) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  const { user, toasts, modo } = useStore();
  if (modo === 'checking') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Carregando Pivot Hub…</div>;
  }
  return (
    <PlataformaProvider>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Guard mod="inicio"><Dashboard /></Guard>} />
          <Route path="clientes" element={<Guard mod="clientes"><Clientes /></Guard>} />
          <Route path="orcamentos" element={<Guard mod="orcamentos"><Orcamentos /></Guard>} />
          <Route path="funil" element={<Guard mod="funil"><Funil /></Guard>} />
          <Route path="ordens" element={<Guard mod="ordens"><Ordens /></Guard>} />
          <Route path="equipamentos" element={<Guard mod="equipamentos"><Equipamentos /></Guard>} />
          <Route path="agenda" element={<Guard mod="agenda"><Agenda /></Guard>} />
          <Route path="financeiro" element={<Guard mod="financeiro"><Financeiro /></Guard>} />
          <Route path="relatorios" element={<Guard mod="relatorios"><Relatorios /></Guard>} />
          <Route path="usuarios" element={<Guard mod="usuarios"><Usuarios /></Guard>} />
          <Route path="configuracoes" element={<Guard mod="configuracoes"><Configuracoes /></Guard>} />
          <Route path="servicos" element={<Guard mod="servicos"><Servicos /></Guard>} />
          <Route path="estoque" element={<Guard mod="estoque"><Estoque /></Guard>} />
          <Route path="contratos" element={<Guard mod="contratos"><Contratos /></Guard>} />
          <Route path="treinamentos" element={<Guard mod="treinamentos"><Treinamentos /></Guard>} />
          <Route path="planejamento" element={<Guard mod="planejamento"><Planejamento /></Guard>} />
          <Route path="social" element={<Guard mod="social"><SocialMedia /></Guard>} />
          <Route path="console" element={<AreaConsole />}>
            <Route index element={<ConsoleVisao />} />
            <Route path="assinantes" element={<ConsoleAssinantes />} />
            <Route path="planos" element={<ConsolePlanos />} />
            <Route path="faturas" element={<ConsoleFaturas />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{t.text}
          </div>
        ))}
      </div>
    </PlataformaProvider>
  );
}
