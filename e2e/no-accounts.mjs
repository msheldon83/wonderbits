/**
 * A build without accounts must be exactly the local-only game: it opens,
 * plays, and never calls a server.
 *
 *   npx vite build && node e2e/no-accounts.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.env.E2E_PORT ?? '8098';
const BASE = `http://localhost:${PORT}`;

const preview = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { cwd: root, stdio: 'ignore' });
const browser = await chromium.launch();
try {
  for (let i = 0; ; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) break;
    if (i > 100) throw new Error('The preview server did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage();
  const calls = [];
  page.on('request', (r) => new URL(r.url()).pathname.includes('/api/') && calls.push(r.url()));
  // The first visit is welcomed, with nothing about accounts, and only once.
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Welcome to Wonderbits' }).waitFor();
  await page.getByRole('heading', { name: 'What you will learn' }).waitFor();
  if ((await page.getByText(/account/i).count()) > 0) throw new Error('A build without accounts talks about accounts on its welcome screen');
  if ((await page.getByRole('button', { name: 'Start playing' }).count()) > 0) throw new Error('A build without accounts shows the guest buttons');
  await page.getByRole('button', { name: 'Back to the game' }).click();
  await page.locator('.map').waitFor();
  await page.reload();
  await page.locator('.map').waitFor();
  if ((await page.getByRole('heading', { name: 'Welcome to Wonderbits' }).count()) > 0) throw new Error('The welcome screen showed itself a second time');
  // Nothing waits for an account: a later island and Create are open.
  await page.goto(`${BASE}/#/map/forest-trails`);
  await page.locator('.map-stone').first().waitFor();
  if ((await page.getByText(/needs an account/).count()) > 0 || (await page.locator('.who-chip').count()) > 0) throw new Error('A build without accounts closes an island or offers to sign in');
  await page.goto(`${BASE}/#/level/l06-the-other-way`);
  await page.getByRole('button', { name: 'Run', exact: true }).waitFor();
  await page.goto(`${BASE}/#/create`);
  await page.getByRole('heading', { name: 'Make something new' }).waitFor();
  for (const hash of ['#/', '#/settings', '#/create', '#/grownup', '#/who', '#/pair']) {
    await page.goto(`${BASE}/${hash}`);
    await page.locator('.app-header').waitFor();
  }
  await page.goto(`${BASE}/#/settings`);
  await page.getByRole('heading', { name: 'For the grown-up' }).waitFor();
  if ((await page.getByText('Set up this device').count()) > 0) throw new Error('A build without accounts offers to set up an account');
  if ((await page.getByRole('button', { name: 'Reset progress' }).count()) !== 1) throw new Error('The local-only settings are not all there');
  if (calls.length > 0) throw new Error(`A build without accounts called the server: ${calls.join(', ')}`);
  console.log('ok  a build without accounts welcomes once, closes nothing, never calls a server and shows no account screens');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  preview.kill();
}
