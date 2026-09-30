import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Lock } from 'lucide-react';
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

function Guard({ mod, children }: { mod: Modulo; children: ReactNode }) {
  const { can } = useStore();
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

export default function App() {
  const { user, toasts } = useStore();
  return (
    <>
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
    </>
  );
}
