// Captura telas reais do app com uma família fictícia, para o vídeo "modo de uso".
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
import { gerarDemo, ROTINA_DEMO } from './demo.mjs';

const BASE = 'http://localhost:8787';
const OUT = new URL('./telas/', import.meta.url).pathname;
const AGORA = Date.parse('2026-10-09T18:20:00Z'); // 15:20 em Brasília
const SENHA = 'familia-ninho-2026';
const ymd = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

async function api(method, path, body, token) {
  const r = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}

for (const e of ['ana.souza', 'rafael', 'lucia', 'marta']) {
  try { const { token } = await api('POST', '/auth/login', { email: `${e}@familia.exemplo`, password: SENHA }); await api('DELETE', '/me', { password: SENHA }, token); } catch { /* não existe */ }
}
const browser = await chromium.launch({ args: ['--lang=pt-BR'], env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' } });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(AGORA));
const foto = async (nome) => { await page.waitForTimeout(500); await page.screenshot({ path: OUT + nome + '.png' }); console.log('📸', nome); };

// 1) Cadastro
await page.goto(BASE);
await page.getByText('Criar conta', { exact: true }).first().waitFor();
await foto('01-boas-vindas');
await page.getByLabel('Seu nome').fill('Ana Souza');
await page.getByLabel('E-mail').fill('ana.souza@familia.exemplo');
await page.getByLabel('Senha').fill(SENHA);
await page.locator('label.check input').check();
await foto('02-cadastro');
await page.locator('button.btn.primary').click();

// 2) Cadastro do bebê
await page.getByPlaceholder('ex.: Helena').waitFor();
await page.getByPlaceholder('ex.: Helena').fill('Helena');
await page.locator('input[type=date]').first().fill(ymd(AGORA - 108 * 864e5));
await page.screenshot({ path: OUT + 'debug.png' }); await page.locator('.choice button', { hasText: 'Menina' }).click();
await page.getByPlaceholder('5,3').fill('6,2');
await page.getByPlaceholder('58').fill('61');
await page.locator('input[type=date]').nth(1).fill(ymd(AGORA - 9 * 864e5));
await foto('03-bebe');
await page.getByRole('button', { name: 'Continuar: rotina' }).click();
await page.locator('label.check input').check();
await foto('04-rotina');
await page.getByRole('button', { name: 'Concluir cadastro' }).click();
await page.locator('.bnav').waitFor();

// 3) Família e dados fictícios pela API
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
await api('PUT', `/babies/${babyId}`, { routine: ROTINA_DEMO }, token);

// 4) Telas do dia a dia
await page.reload();
await page.locator('.bnav').waitFor();
await page.waitForTimeout(1200);
await foto('05-hoje');
await page.evaluate(() => window.scrollTo(0, 520));
await foto('06-hoje-rolado');
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('.qbtn').first().click();
await foto('07-registro');
await page.keyboard.press('Escape');
await page.locator('.sheet-bg, .backdrop').first().click({ position: { x: 10, y: 10 } }).catch(() => undefined);
await page.waitForTimeout(400);

const aba = async (nome, arquivo, rolar = []) => {
  await page.locator('.bnav button', { hasText: nome }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await foto(arquivo);
  for (const [i, y] of rolar.entries()) { await page.evaluate((y) => window.scrollTo(0, y), y); await foto(`${arquivo}-${i + 2}`); }
};
await aba('Indicadores', '08-indicadores', [600, 1250]);
await aba('Mural', '09-mural', [600]);
await aba('Saúde', '10-saude', [650]);
await aba('Família', '11-familia', [600]);
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: 'Convidar' }).click();
await page.getByRole('button', { name: /Avó/ }).last().click();
await page.getByRole('button', { name: 'Gerar código de convite' }).click();
await page.waitForTimeout(600);
await foto('12-convite');
await page.reload();
await page.locator('.bnav').waitFor();
await page.locator('.bell').click();
await foto('13-notificacoes');

await browser.close();
