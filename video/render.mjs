import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const dir = new URL('.', import.meta.url).pathname;
const [modo, ...args] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const versao = process.env.VERSAO || 'completo'; // completo | essencial
const quadros = versao === 'essencial' ? 'quadros-60' : 'quadros';
await p.goto('file://' + dir + 'motion.html' + (versao === 'essencial' ? '?v=essencial' : ''));
await p.evaluate(() => window.pronto);
if (modo === 'eventos') {
  // linha do tempo para a trilha sonora: cortes de tela, balões e toques
  console.log(JSON.stringify(await p.evaluate(() => ({ DUR, INICIO, FIM, telas: TELAS.map((x) => x[1]), baloes: BALOES.map((x) => x[0]), toques: TOQUES.map((x) => x.t), pessoas: PESSOAS.map(([a]) => PESSOAS_A + a * PASSO_PESSOA / .6) }))));
} else if (modo === 'teste') {
  for (const t of args) { await p.evaluate((t) => render(t), +t); await p.screenshot({ path: `${dir}teste-${versao}-${t}.png` }); }
} else {
  const fps = 30, dur = await p.evaluate(() => DUR);
  const { mkdirSync } = await import('fs'); mkdirSync(dir + quadros, { recursive: true });
  const ini = +(args[0] ?? 0), fim = Math.min(+(args[1] ?? Infinity), Math.round(dur * fps));
  for (let i = ini; i < fim; i++) {
    await p.evaluate((t) => render(t), i / fps);
    await p.screenshot({ path: `${dir}${quadros}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 300 === 0) console.log(i);
  }
}
await b.close();
