import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versão do app enviada ao servidor (painel do desenvolvedor): data/hora do build ou commit do Workers Builds
const versao = (process.env.WORKERS_CI_COMMIT_SHA || '').slice(0, 7) || new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __VERSAO__: JSON.stringify(versao) },
});
