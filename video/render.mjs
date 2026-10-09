import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const dir = new URL('.', import.meta.url).pathname;
const [modo, ...args] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + dir + 'motion.html');
await p.evaluate(() => window.pronto);
if (modo === 'teste') {
  for (const t of args) { await p.evaluate((t) => render(t), +t); await p.screenshot({ path: `${dir}teste-${t}.png` }); }
} else {
  const fps = 30, dur = await p.evaluate(() => DUR);
  const { mkdirSync } = await import('fs'); mkdirSync(dir + 'quadros', { recursive: true });
  for (let i = 0; i < dur * fps; i++) {
    await p.evaluate((t) => render(t), i / fps);
    await p.screenshot({ path: `${dir}quadros/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 300 === 0) console.log(i);
  }
}
await b.close();
