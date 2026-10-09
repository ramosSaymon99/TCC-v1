import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { registrarSW } from './lib/push';

registrarSW();
window.addEventListener('appinstalled', () => import('./lib/api').then(({ api }) => api.uso('app_instalado')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
