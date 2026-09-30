// Gera um index.html único (JS + CSS embutidos) a partir do build do Vite.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const out = process.argv[2] || 'cloudflare-dist';
const assets = readdirSync('dist/assets');
const css = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8');
const js = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/g, '<\\/script');
const svg = readFileSync('public/favicon.svg', 'utf8');

let html = readFileSync('dist/index.html', 'utf8')
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`)
  .replace(/<script type="module" crossorigin src="[^"]*"><\/script>/, () => '')
  .replace('href="./favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(svg)}"`)
  .replace('</body>', () => `<script type="module">${js}</script>\n</body>`);

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/index.html`, html);
console.log(`${out}/index.html gerado (${(html.length / 1024).toFixed(0)} KB)`);
