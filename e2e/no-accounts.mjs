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
  for (const hash of ['#/', '#/settings', '#/create', '#/grownup', '#/who', '#/pair']) {
    await page.goto(`${BASE}/${hash}`);
    await page.locator('.app-header').waitFor();
  }
  await page.goto(`${BASE}/#/settings`);
  await page.getByRole('heading', { name: 'For the grown-up' }).waitFor();
  if ((await page.getByText('Set up this device').count()) > 0) throw new Error('A build without accounts offers to set up an account');
  if ((await page.getByRole('button', { name: 'Reset progress' }).count()) !== 1) throw new Error('The local-only settings are not all there');
  if (calls.length > 0) throw new Error(`A build without accounts called the server: ${calls.join(', ')}`);
  console.log('ok  a build without accounts never calls a server and shows no account screens');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  preview.kill();
}
