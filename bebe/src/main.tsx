import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { registrarSW } from './lib/push';

registrarSW();
window.addEventListener('appinstalled', () => import('./lib/api').then(({ api }) => api.uso('app_instalado')));

// Erros de tela vão (sem dados pessoais) para o painel do desenvolvedor — no máximo 5 por sessão
let errosEnviados = 0;
function reportarErro(mensagem: string) {
  if (errosEnviados >= 5 || !mensagem || location.hostname === 'localhost') return;
  errosEnviados++;
  fetch('./api/erro', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensagem: mensagem.slice(0, 300), tela: location.hash.slice(1) || 'hoje', versao: __VERSAO__ }),
    keepalive: true,
  }).catch(() => undefined);
}
window.addEventListener('error', (e) => reportarErro(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r && typeof r === 'object' && 'status' in r) return; // erros de API já tratados na tela (ex.: sem internet, senha errada)
  reportarErro(r instanceof Error ? `${r.name}: ${r.message}` : String(r));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
