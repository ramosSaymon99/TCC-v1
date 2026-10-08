import { Navigate, Route, Routes } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Layout from './components/Layout';
import { useStore } from './store/Store';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Pacientes from './pages/Pacientes';
import PacienteDetalhe from './pages/PacienteDetalhe';
import Alimentos from './pages/Alimentos';
import Calculadoras from './pages/Calculadoras';
import Financeiro from './pages/Financeiro';
import Captacao from './pages/Captacao';
import Configuracoes from './pages/Configuracoes';

export default function App() {
  const { toasts } = useStore();
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="pacientes/:id" element={<PacienteDetalhe />} />
          <Route path="alimentos" element={<Alimentos />} />
          <Route path="calculadoras" element={<Calculadoras />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="captacao" element={<Captacao />} />
          <Route path="configuracoes" element={<Configuracoes />} />
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
