import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

if (!process.env.LEASING_DATABASE_URL?.includes('leasing-test-')) throw new Error('Run via npm run test:browser with an isolated database');
const base = 'http://127.0.0.1:3107';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3107'], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
let logs = '';
server.stdout.on('data', data => { logs += data; });
server.stderr.on('data', data => { logs += data; });
let browser;
let page;
const artifacts = resolve('.demo-artifacts');
mkdirSync(artifacts, { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(base)).ok; } catch { /* startup */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Production server must start');
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--disable-dev-shm-usage', ...(process.env.CHROMIUM_SINGLE_PROCESS === '1' ? ['--single-process', '--no-zygote'] : [])] } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("console", msg => { if (["error", "warning", "info"].includes(msg.type())) console.error("CONSOLE", msg.text()); });
  page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER ERROR', error.message); });
  page.on('response', response => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  // A click only queues the navigation: wait for both the card URL and its
  // heading before reading page.url() or taking a screenshot of the card.
  async function openCard(link, pattern, heading) {
    await link.click();
    await page.waitForURL(url => pattern.test(url.pathname));
    await heading.waitFor();
    await page.waitForLoadState('networkidle');
    return page.url();
  }
  async function role(name) {
    const select = page.getByLabel('Демо-пользователь');
    const option = await select.locator('option').evaluateAll((items, name) => items.find(item => item.textContent.includes(name))?.value, name);
    assert(option, `Role ${name} exists`);
    await select.selectOption(option);
    await page.waitForFunction(name => document.querySelector('header')?.textContent.includes(`Роль: ${name}`), name);
    await page.waitForFunction(() => !document.querySelector('select[name=userId]')?.disabled);
  }
  await page.goto(base);
  await role('Менеджер по продажам');
  await page.goto(`${base}/clients`);
  await openCard(
    page.getByRole('link', { name: 'ТОО ДЕМО — Учебная логистика', exact: true }),
    /^\/clients\/[^/]+$/,
    page.getByRole('heading', { name: 'ТОО ДЕМО — Учебная логистика' }),
  );
  console.log('PASS client dossier opens');
  await page.goto(`${base}/applications/new`);
  await page.waitForLoadState("networkidle");
  const clientId = await page.locator('select[name=clientId] option').evaluateAll(items => items.find(item => item.textContent.includes('Учебная логистика')).value);
  await page.locator('select[name=clientId]').selectOption(clientId);
  await page.locator('input[name=assetCost]').fill('60000000');
  await page.locator('input[name=downPayment]').fill('12000000');
  await page.locator('select[name=termMonths]').selectOption('12');
  await page.locator('input[name=annualRate]').fill('18');
  await page.getByRole('button', { name: 'Создать заявку (черновик)' }).click();
  await page.waitForURL(url => /\/applications\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), { waitUntil: 'commit' });
  await page.waitForLoadState('networkidle');
  const applicationUrl = page.url();
  const applicationNumber = await page.locator('h1').innerText();
  assert(await page.getByText('23.91%', { exact: true }).count() > 0, 'IRR must already be expressed as percent');
  await page.getByRole('button', { name: 'Отправить на рассмотрение' }).click();
  await page.getByText('Маршрут согласования', { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(page.url(), applicationUrl, 'Submission stays on the application card');
  await page.screenshot({ path: `${artifacts}/01-application.png`, fullPage: true });
  console.log('PASS application creation and submission', applicationNumber);
  for (const name of ['Кредитный аналитик', 'Руководитель продаж', 'Юрист', 'Риск-менеджер', 'ПОД/ФТ']) {
    await role(name);
    assert.equal(page.url(), applicationUrl, 'Role switch preserves the application');
    const button = page.getByRole('button', { name: 'Согласовать', exact: true });
    await button.click();
    await button.waitFor({ state: 'hidden' });
  }
  await role('Член кредитного комитета');
  await page.getByRole('link', { name: 'Перейти к голосованию' }).click();
  const row = page.locator('tr').filter({ hasText: applicationNumber });
  await row.getByRole('button', { name: 'За', exact: true }).click();
  await row.getByText(/Ваш голос уже учтён/).waitFor();
  await role('Руководство');
  await row.getByRole('button', { name: 'За', exact: true }).click();
  await row.waitFor({ state: 'hidden' });
  console.log('PASS sequential approvals and committee majority');
  await role('Лизинговые операции');
  await page.goto(`${base}/contracts/new`);
  const candidate = page.locator('li').filter({ hasText: applicationNumber });
  await candidate.getByRole('link', { name: 'Выбрать' }).click();
  await page.waitForURL(url => url.searchParams.get('application') !== null);
  const createContract = page.getByRole('button', { name: 'Сформировать договор', exact: true });
  await createContract.waitFor();
  await createContract.click();
  await page.waitForURL(url => /\/contracts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
  await page.getByRole('heading', { name: /ДЛ-/ }).first().waitFor();
  await page.waitForLoadState('networkidle');
  assert.match(await page.locator('h1').innerText(), /ДЛ-/);
  await page.screenshot({ path: `${artifacts}/02-contract.png`, fullPage: true });
  console.log('PASS contract created through UI');
  await role('Бухгалтерия');
  await page.goto(`${base}/contracts`);
  const paymentUrl = await openCard(
    page.getByRole('link', { name: 'ДЛ-DEMO-001', exact: true }),
    /^\/contracts\/[^/]+$/,
    page.getByRole('heading', { name: 'ДЛ-DEMO-001' }).first(),
  );
  assert.match(new URL(paymentUrl).pathname, /^\/contracts\/[^/]+$/, 'Contract card URL must be captured after navigation');
  await page.getByPlaceholder('Сумма, ₸').fill('1000');
  await page.getByRole('button', { name: 'Зачислить', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Платёж зачислен' }).waitFor();
  assert.equal(await page.getByPlaceholder('Сумма, ₸').inputValue(), '');
  await page.goto(`${base}/payments`);
  await page.getByRole('button', { name: 'Импортировать демо-выписку' }).click();
  await page.getByText(/Импортировано: 2/).waitFor();
  await page.getByRole('button', { name: 'Импортировать демо-выписку' }).click();
  await page.getByText(/Импортировано: 0.*ранее учтено: 2/).waitFor();
  await page.goto(paymentUrl);
  await page.getByRole('heading', { name: 'ДЛ-DEMO-001' }).first().waitFor();
  await page.getByText(/График платежей · \d+ периодов/).first().waitFor();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${artifacts}/03-payments.png`, fullPage: true });
  console.log('PASS manual payment and idempotent CSV import');
  await role('Системный администратор');
  await page.goto(`${base}/admin`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Симулировать время' }).click();
  await page.getByText("Системная дата обновлена.", { exact: true }).waitFor();
  await page.goto(paymentUrl);
  await page.getByRole('heading', { name: 'ДЛ-DEMO-001' }).first().waitFor();
  await page.getByText(/Просрочка: DPD 61/).waitFor();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${artifacts}/04-overdue.png`, fullPage: true });
  console.log('PASS time simulation and partial-payment overdue');
  for (const path of ['/', '/clients', '/applications', '/contracts', '/payments', '/calculator', '/committee', '/overdue', '/monitoring', '/portfolio', '/audit', '/admin', '/account', '/search?q=DEMO']) {
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200, path);
    assert.equal(await page.getByRole('heading', { name: 'Не удалось открыть страницу' }).count(), 0, path);
  }
  assert.deepEqual(errors, [], 'No browser errors or HTTP 500');
  console.log('PASS 14 page routes, no browser errors or HTTP 500; screenshots in .demo-artifacts');
} catch (error) {
  const { PrismaClient } = await import("@prisma/client"); const db = new PrismaClient({ datasourceUrl: process.env.LEASING_DATABASE_URL }); console.error("LATEST APP", await db.application.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, number: true, workflowSteps: { select: { status: true } } } })); await db.$disconnect();
  if (page) { console.error("FAILED URL", page.url(), (await page.locator("body").innerText()).slice(0, 3500)); await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }); }
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
}
