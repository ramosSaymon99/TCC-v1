// Gera as artes de divulgação a partir de arte.html (uso: node divulgacao/gerar.mjs)
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const DIR = new URL('.', import.meta.url).pathname;
const b = await chromium.launch();
for (const [id, h, arq] of [['feed', 1350, 'ninho-post-feed.png'], ['story', 1920, 'ninho-story.png']]) {
  const p = await b.newPage({ viewport: { width: 1080, height: h }, deviceScaleFactor: 1 });
  await p.goto('file://' + DIR + 'arte.html#' + id);
  await p.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; })))));
  await p.screenshot({ path: DIR + arq });
}
await b.close();
console.log('ok');
