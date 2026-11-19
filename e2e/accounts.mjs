/**
 * Accounts, end to end, in real browsers against a real server and Postgres.
 *
 *   VITE_ACCOUNTS=1 npx vite build
 *   E2E_DATABASE_URL=postgres://wonderbits:wonderbits@localhost:5432/wonderbits_e2e node e2e/accounts.mjs
 *
 * The database is emptied first: never point this at one you care about.
 * Needs Playwright (`npx playwright install chromium` once). Set E2E_SHOTS
 * to a folder to keep a screenshot of each screen.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Loaded the CommonJS way so a Playwright installed outside this project is found too.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = fileURLToPath(new URL('..', import.meta.url));
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://wonderbits:wonderbits@localhost:5432/wonderbits_e2e';
const PORT = process.env.E2E_PORT ?? '8099';
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.E2E_SHOTS;
const env = { ...process.env, DATABASE_URL, PORT, PUBLIC_URL: BASE, STATIC_DIR: `${root}dist` };
const tsx = (script, args = []) => ['--import', 'tsx', `src/${script}`, ...args];

execFileSync('psql', [DATABASE_URL, '-q', '-c', 'drop schema public cascade; create schema public'], { stdio: 'ignore' });
const invite = execFileSync('node', tsx('invite.ts'), { cwd: `${root}server`, env, encoding: 'utf8' }).split(' ')[0];

let log = '';
const server = spawn('node', tsx('index.ts'), { cwd: `${root}server`, env });
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`ok  ${name}`);
};
const until = async (what, test, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    const value = await test();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${what}`);
};
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${String(steps.length).padStart(2, '0')}-${name}.png` });

const browser = await chromium.launch();
try {
  await until('the server', () => fetch(`${BASE}/api/health`).then((r) => r.ok, () => false));
  const device = async (viewport = { width: 1024, height: 768 }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (e) => {
      throw e;
    });
    return page;
  };

  // ----- The grown-up signs up -----
  const parent = await device({ width: 900, height: 1000 });
  await parent.goto(`${BASE}/#/grownup`);
  await shot(parent, 'grownup-signin');
  await parent.getByLabel('Your email address').fill('lee@example.com');
  await parent.getByLabel('Invite code').fill(invite);
  await parent.getByRole('button', { name: 'Email me a link' }).click();
  await parent.getByRole('heading', { name: 'Check your email' }).waitFor();
  const link = await until('the sign-in mail', () => /http\S+\/#\/grownup\/signin\/\S+/.exec(log)?.[0]);
  await parent.goto(link);
  await parent.getByRole('heading', { name: 'Your children' }).waitFor();
  step('a grown-up signs up with an invite and the emailed link');

  // ----- They add two children -----
  const addChild = async (nickname, pin, picture) => {
    await parent.getByRole('button', { name: 'Add a child' }).click();
    await parent.getByLabel('Nickname').fill(nickname);
    await parent.getByRole('button', { name: picture, exact: true }).click();
    await parent.getByLabel(/^PIN/).fill(pin);
    if (nickname === 'Robin') {
      await parent.getByText('What Wonderbits keeps about your child').click();
      await shot(parent, 'add-child');
      // Without the tick, the profile cannot be made.
      if (!(await parent.getByRole('button', { name: `Add ${nickname}` }).isDisabled())) throw new Error('A child could be added without consent');
    }
    await parent.getByRole('checkbox', { name: /parent or guardian/ }).check();
    await parent.getByRole('button', { name: `Add ${nickname}` }).click();
    await parent.locator('.child-card', { hasText: nickname }).waitFor();
  };
  await addChild('Robin', '1234', 'Fox');
  await addChild('Wren', '4321', 'Owl');
  step('they add two children, each with consent');

  // ----- A PIN from a browser nobody let in opens nothing -----
  const stranger = await device();
  await stranger.goto(`${BASE}/#/who`);
  await stranger.getByRole('heading', { name: 'Set up this device' }).waitFor();
  const robinId = (await (await parent.request.get(`${BASE}/api/family`)).json()).children.find((c) => c.nickname === 'Robin').id;
  const refused = await stranger.request.post(`${BASE}/api/child/signin`, { data: { childId: robinId, pin: '1234' }, headers: { Origin: BASE } });
  if (refused.status() !== 401) throw new Error(`The right PIN from an unknown device got ${refused.status()}, not 401`);
  step('the right PIN from a device nobody let in is refused');

  // ----- A device is let in with a code -----
  const letIn = async (page) => {
    await page.goto(`${BASE}/#/pair`);
    await page.getByRole('button', { name: 'Show a code' }).click();
    const code = (await page.locator('.pair-code').innerText()).replace(/\s/g, '');
    await shot(page, 'pair-code');
    await parent.getByLabel('Code from the other device').fill(code);
    await parent.getByRole('button', { name: 'Let that device in' }).click();
    await page.getByRole('heading', { name: 'Who is playing?' }).waitFor();
  };
  const signIn = async (page, nickname, pin) => {
    await page.getByRole('button', { name: nickname }).click();
    for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
    await page.getByRole('button', { name: 'Go' }).click();
    await page.locator('.who-chip', { hasText: nickname }).waitFor();
  };
  const tablet = await device();
  await letIn(tablet);
  await shot(tablet, 'who');
  step('a device shows a code, the grown-up types it, and the device is let in');

  // ----- A child signs in; a wrong PIN does not -----
  await tablet.getByRole('button', { name: 'Robin' }).click();
  for (const digit of '0000') await tablet.getByRole('button', { name: digit, exact: true }).click();
  await tablet.getByRole('button', { name: 'Go' }).click();
  await tablet.getByText('That is not the PIN').waitFor();
  await shot(tablet, 'pin-wrong');
  await tablet.getByRole('button', { name: 'I am someone else' }).click();
  await signIn(tablet, 'Robin', '1234');
  await shot(tablet, 'map-signed-in');
  step('a wrong PIN is refused and the right one signs the child in');

  // ----- What the child makes reaches the server -----
  await tablet.goto(`${BASE}/#/create`);
  await tablet.getByRole('button', { name: /An empty island/ }).click();
  await tablet.getByRole('button', { name: 'Make it', exact: true }).click();
  await tablet.waitForURL(/#\/create\/c-/);
  const docs = await until('the creation on the server', async () => {
    const { docs } = await (await tablet.request.get(`${BASE}/api/sync?since=0`)).json();
    return docs.some((d) => d.key.startsWith('creation:')) && docs;
  });
  const made = docs.find((d) => d.key.startsWith('creation:'));
  if (made.value.madeBy !== 'Robin') throw new Error(`The creation is by ${made.value.madeBy}, not Robin`);
  step('a new creation is saved to the server with the child’s nickname on it');

  // ----- Another of the child's devices solves it; the tablet hears -----
  // (Stands in for a second device: the puzzle comes back marked as solved by its maker.)
  const solved = { ...made.value, status: 'proved', updatedAt: Date.now() + 1000, proof: { solution: made.value.program, steps: made.value.program.length, provedAt: Date.now() + 1000 } };
  const put = await tablet.request.put(`${BASE}/api/sync/${encodeURIComponent(made.key)}`, { data: { baseRev: made.rev, value: solved }, headers: { Origin: BASE } });
  if (!put.ok()) throw new Error(`Could not store the solved copy: ${put.status()} ${await put.text()}`);
  await tablet.goto(`${BASE}/#/create`);
  await tablet.evaluate(() => window.dispatchEvent(new Event('focus')));
  await tablet.locator('.ready-tag', { hasText: 'Ready to play' }).waitFor();
  step('a change made elsewhere arrives on this device');

  // ----- Sharing inside the family -----
  await tablet.getByRole('button', { name: /^Share / }).click();
  await shot(tablet, 'share-dialog');
  await tablet.getByRole('button', { name: 'Show my grown-up' }).click();
  await tablet.getByText('Sent to your grown-up!').waitFor();
  await tablet.getByRole('button', { name: 'Done' }).click();
  await tablet.getByRole('button', { name: /^Share / }).click();
  await tablet.getByRole('button', { name: 'Send to Wren' }).click();
  await tablet.getByText('Sent to Wren!').waitFor();
  await until('the mail about it', () => /Robin made something in Wonderbits/.test(log));
  step('the child shows it to the grown-up, who is mailed, and sends it to a sister');

  const laptop = await device();
  await letIn(laptop);
  await signIn(laptop, 'Wren', '4321');
  await laptop.locator('.count-dot').waitFor();
  await laptop.goto(`${BASE}/#/create`);
  await laptop.getByRole('heading', { name: 'From my family' }).waitFor();
  await shot(laptop, 'inbox');
  await laptop.getByRole('button', { name: 'Keep it' }).click();
  await laptop.locator('.shelf-card', { hasText: 'My island' }).waitFor();
  await laptop.getByRole('heading', { name: 'From my family' }).waitFor({ state: 'detached' });
  step('the sister sees it, keeps it, and it joins her shelf');

  // ----- The grown-up's dashboard -----
  await parent.reload();
  await parent.getByRole('heading', { name: 'Shown to you' }).waitFor();
  await parent.getByRole('heading', { name: 'Sent between your children' }).waitFor();
  const robinCard = parent.locator('.child-card', { hasText: 'Robin' });
  await until('Robin’s creation on the dashboard', async () => (await robinCard.locator('.child-stats').innerText()).replace(/\s+/g, ' ').includes('Made 1'));
  await robinCard.getByText('Islands and creations').click();
  await shot(parent, 'dashboard');
  await robinCard.getByRole('button', { name: 'Play it' }).click();
  await parent.locator('.grownup-play').waitFor();
  await parent.waitForTimeout(500);
  await shot(parent, 'dashboard-play');
  await parent.getByRole('button', { name: 'Back' }).click();
  step('the dashboard shows progress, creations and shares, and the grown-up can play one');

  // ----- Taking a device away signs its child out -----
  const row = parent.locator('.device-list li').first();
  await row.getByRole('button', { name: 'Take away' }).click();
  await row.getByRole('button', { name: 'Yes, sign it out' }).click();
  await until('one device left', async () => (await parent.locator('.device-list li').count()) === 1);
  await tablet.goto(`${BASE}/#/`);
  await tablet.reload();
  await tablet.locator('.app-header').waitFor();
  if ((await tablet.locator('.who-chip').count()) !== 0) throw new Error('The child is still signed in on a device that was taken away');
  const after = await tablet.request.get(`${BASE}/api/sync`);
  if (after.status() !== 401) throw new Error(`A device that was taken away still syncs: ${after.status()}`);
  await shot(tablet, 'taken-away');
  step('taking a device away signs the child out there');

  // ----- Deleting a child removes what was kept -----
  const wrenCard = parent.locator('.child-card', { hasText: 'Wren' });
  await wrenCard.getByText('Manage Wren').click();
  await wrenCard.getByRole('button', { name: /Delete Wren/ }).click();
  await wrenCard.getByRole('button', { name: 'Yes, delete it all' }).click();
  await wrenCard.waitFor({ state: 'detached' });
  const gone = await laptop.request.get(`${BASE}/api/sync`);
  if (gone.status() !== 401) throw new Error(`A deleted child still syncs: ${gone.status()}`);
  step('deleting a child removes their profile and signs them out');

  console.log(`\n${steps.length} steps passed.`);
} catch (e) {
  console.error(`\nFAILED after: ${steps.at(-1) ?? 'nothing'}\n`, e, `\n--- server log ---\n${log.slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
