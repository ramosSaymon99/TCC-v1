// Captura as telas atuais do app com uma família fictícia, para o vídeo "modo de uso" (v2).
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
import { gerarDemo, ROTINA_DEMO } from './demo.mjs';

const BASE = 'http://localhost:8787';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = DIR + 'telas/';
const AGORA = Date.parse(new Date().toISOString().slice(0, 10) + 'T18:20:00Z'); // 15:20 em Brasília
const SENHA = 'familia-ninho-2026';
const ymd = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

async function api(method, path, body, token) {
  const r = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}

for (const e of ['ana.souza', 'rafael', 'lucia', 'marta']) {
  try { const { token } = await api('POST', '/auth/login', { email: e + '@familia.exemplo', password: SENHA }); await api('DELETE', '/me', { password: SENHA }, token); } catch { /* não existe */ }
}
const b = await chromium.launch({ args: ['--lang=pt-BR'], env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' } });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light', isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date(AGORA));
const erros = [];
p.on('pageerror', (e) => { erros.push(e.message); console.log('PAGEERROR', e.message); });
p.on('framenavigated', (f) => f === p.mainFrame() && console.log('NAVEGOU', f.url()));
p.on('dialog', (d) => d.accept());
const foto = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: OUT + n + '.png' }); console.log('📸', n); };
// No celular quem rola é a área .main (a janela fica parada)
const rolar = async (sel) => { await p.locator(sel).first().evaluate((el) => { const m = document.querySelector('.main'); m.scrollTo(0, el.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - 70); }); await p.waitForTimeout(300); };
const aba = async (nome) => { await p.locator('.bnav button', { hasText: nome }).click(); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('.main').scrollTo(0, 0)); };
const semToast = () => p.addStyleTag({ content: '.toast{visibility:hidden!important}' });

// 1) Conta
await p.goto(BASE);
await p.getByLabel('Seu nome').fill('Ana Souza');
await p.getByLabel('E-mail').fill('ana.souza@familia.exemplo');
await p.getByLabel('Senha').fill(SENHA);
await p.locator('label.check input').check();
await foto('01-cadastro');
await p.locator('button.btn.primary').click();

// 2) Bebê + rotina pronta
await p.getByPlaceholder('ex.: Helena').waitFor();
await p.getByPlaceholder('ex.: Helena').fill('Helena');
await p.locator('input[type=date]').first().fill(ymd(AGORA - 108 * 864e5));
await p.locator('.choice button', { hasText: 'Menina' }).click();
await foto('02-bebe');
await p.getByRole('button', { name: 'Continuar: rotina' }).click();
await p.locator('label.check input').check();
await foto('03-rotina');
await p.getByRole('button', { name: 'Concluir cadastro' }).click();
await p.locator('.bnav').waitFor();
await p.waitForTimeout(1200);

// 3) Primeiros passos + 1º registro (comemoração)
await rolar('.passos');
await foto('04-primeiros-passos');
await p.locator('.passo', { hasText: 'primeiro registro' }).click();
await p.getByRole('button', { name: /Já aconteceu/ }).click();
await foto('05-registro');
await p.locator('.sheet button.btn.primary').click();
await p.waitForTimeout(1600);
await semToast();
await foto('06-comemoracao');
await p.getByRole('button', { name: 'Agora não' }).click();

// 4) Convite (Casa → Família e ajustes)
await aba('Casa');
await p.getByRole('tab', { name: /Família e ajustes/ }).click();
await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Entendi' }).click().catch(() => {});
await p.getByRole('button', { name: 'Convidar' }).first().click();
await p.getByRole('button', { name: /Avó/ }).last().click();
await p.getByRole('button', { name: 'Gerar código de convite' }).click();
await p.waitForTimeout(800);
await semToast();
await foto('07-convite-pronto');
await p.getByRole('button', { name: 'Agora não' }).click();
await p.waitForTimeout(500);
await foto('07-convite');
await p.keyboard.press('Escape');

// 5) Família e dados fictícios (API)
const { token } = await api('POST', '/auth/login', { email: 'ana.souza@familia.exemplo', password: SENHA });
const me = await api('GET', '/me', null, token);
const babyId = me.babies[0].id;
const ids = { mae: me.user.id };
for (const [nome, role, access, email] of [['Rafael Souza', 'pai', 'admin', 'rafael'], ['Lúcia Souza', 'avo_f', 'editor', 'lucia'], ['Marta Lima', 'baba', 'editor', 'marta']]) {
  const { code } = await api('POST', `/babies/${babyId}/invites`, { role, access }, token);
  const s = await api('POST', '/auth/signup', { name: nome, email: `${email}@familia.exemplo`, password: SENHA, consent: true });
  await api('POST', '/invites/accept', { code, role }, s.token);
  ids[role] = s.user.id;
}
const { seed, vacinas } = gerarDemo(ymd(AGORA - 108 * 864e5), ids, AGORA);
await api('POST', `/babies/${babyId}/seed`, seed, token);
for (const v of vacinas) await api('PUT', `/babies/${babyId}/vaccines/${v.code}`, { date: v.date }, token);
await api('PUT', `/babies/${babyId}`, { routine: ROTINA_DEMO, settings: { plantao: { dias: { 0: ids.mae, 1: ids.pai, 2: ids.mae, 3: ids.pai, 4: ids.mae, 5: ids.pai, 6: ids.avo_f }, de: '22:00', ate: '06:00' } } }, token);
const foto64 = 'data:image/jpeg;base64,' + readFileSync(DIR + 'foto.jpg').toString('base64');
const postId = crypto.randomUUID();
await api('POST', `/babies/${babyId}/posts`, { id: postId, photo: foto64, caption: 'Primeiro banho de sol ☀️', taken_at: new Date(AGORA - 2 * 3600e3).toISOString() }, token);

for (const e of ['rafael', 'lucia']) { const s = await api('POST', '/auth/login', { email: e + '@familia.exemplo', password: SENHA }); await api('POST', `/babies/${babyId}/posts/${postId}/like`, null, s.token); }

// Sem dicas de primeira vez e sem "primeiros passos" nas telas com dados
await p.evaluate(({ u, bb }) => {
  for (const k of ['previsoes', 'repetir', 'casa-mural', 'casa-familia', 'diario']) localStorage.setItem(`ninho-dica-${k}`, '1');
  localStorage.setItem(`ninho-passos-${u}-${bb}`, 'ocultar');
  localStorage.setItem('ninho-madrugada', 'off');
}, { u: me.user.id, bb: babyId });
await p.reload();
await p.locator('.bnav').waitFor();
await p.waitForTimeout(1500);
await aba('Hoje');
await p.waitForTimeout(800);
await semToast();

// 6) Hoje com dados
await foto('08-hoje');
await rolar('.quick');
await foto('09-hoje-registro');
await rolar('.card.hide-desk');
await foto('10-onde-agir');
await rolar('.card:has(h2:text-is("Rotina planejada"))');
await foto('10b-rotina');

// 7) Remédio: alerta de dose dupla
await p.evaluate(() => document.querySelector('.main').scrollTo(0, 0));
await p.locator('.qbtn', { hasText: 'Remédio' }).click();
await p.getByPlaceholder('ex.: Vitamina D').fill('Paracetamol (gotas)');
await p.getByRole('button', { name: '6 h', exact: true }).click();
await p.locator('.sheet button.btn.primary').click();
await p.waitForTimeout(1200);
await p.locator('.qbtn', { hasText: 'Remédio' }).click();
await p.getByPlaceholder('ex.: Vitamina D').fill('Paracetamol (gotas)');
await p.waitForTimeout(400);
await semToast();
await foto('11-dose-dupla');
await p.keyboard.press('Escape');

// 8) Dia a dia
await aba('Dia a dia');
await semToast();
await foto('12-dia-a-dia');
await p.locator('.post img').first().evaluate((i) => (i.complete ? 1 : new Promise((r) => { i.onload = r; })));
await p.evaluate(() => document.querySelector('.main').scrollTo(0, document.querySelector('.main').scrollHeight));
await foto('12b-dia-a-dia-post');

// 9) Evolução
await aba('Evolução');
await foto('13-evolucao');
await p.evaluate(() => document.querySelector('.main').scrollTo(0, 620));
await foto('14-evolucao-2');

// 10) Saúde
await aba('Saúde');
await foto('15-saude');
await p.locator('.seg button', { hasText: 'Marcos' }).click();
await p.waitForTimeout(500);
await foto('16-saude-marcos');

// 11) Casa: mural (leite) e plantão
await aba('Casa');
await p.getByRole('tab', { name: /Mural/ }).click();
await p.locator('.seg button', { hasText: 'Leite' }).click();
await foto('17-casa-leite');
await p.getByRole('tab', { name: /Família e ajustes/ }).click();
await p.waitForTimeout(600);
await p.getByRole('button', { name: /Sugerir/ }).click();
await p.waitForTimeout(600);
await foto('19-sugestao');
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
await rolar('.card:has(h2:text("Plantão da noite"))');
await foto('18-casa-plantao');

console.log('ERROS:', erros);
await b.close();
