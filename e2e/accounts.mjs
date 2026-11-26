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
// The grown-up in this story also runs this copy, so they can open the owner's page.
const env = { ...process.env, DATABASE_URL, PORT, PUBLIC_URL: BASE, STATIC_DIR: `${root}dist`, ADMIN_EMAILS: 'lee@example.com' };
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
  await stranger.getByRole('heading', { name: 'Sign in or set up an account' }).waitFor();
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
    // A device that has never shown the welcome screen shows it now, once.
    const chip = page.locator('.who-chip', { hasText: nickname });
    const welcome = page.getByRole('button', { name: 'Back to the game' });
    await chip.or(welcome).first().waitFor();
    if (await welcome.isVisible()) await welcome.click();
    await chip.waitFor();
  };
  const tablet = await device();

  // ----- Before anyone signs in: the welcome screen, the first island, and what waits for an account -----
  /** Everything a guest read on the screens that ask for an account, to check its wording afterwards. */
  let guestWords = '';
  const read = async () => (guestWords += `\n${await tablet.locator('.app').innerText()}`);
  await tablet.goto(`${BASE}/`);
  await tablet.getByRole('heading', { name: 'Welcome to Wonderbits' }).waitFor();
  for (const heading of ['What it is', 'What you will learn', 'What to expect', 'For your grown-up', 'Keeping your work safe']) await tablet.getByRole('heading', { name: heading }).waitFor();
  await tablet.getByText('Repeating, without writing it twice').waitFor();
  await shot(tablet, 'welcome');
  await tablet.getByRole('button', { name: 'Start playing' }).click();
  await tablet.locator('.who-chip.is-guest', { hasText: 'Sign in' }).waitFor();
  await shot(tablet, 'guest-map');
  await read();
  await tablet.reload();
  await tablet.locator('.who-chip.is-guest').waitFor();
  if ((await tablet.getByRole('heading', { name: 'Welcome to Wonderbits' }).count()) !== 0) throw new Error('The welcome screen showed itself a second time');
  await tablet.goto(`${BASE}/#/settings`);
  await tablet.getByRole('link', { name: 'About Wonderbits' }).click();
  await tablet.getByRole('heading', { name: 'Welcome to Wonderbits' }).waitFor();
  await tablet.getByRole('button', { name: 'Start playing' }).click();
  await tablet.locator('.who-chip.is-guest').waitFor();
  step('a first visit is welcomed with what the game is and teaches, once, and the map offers Sign in');

  await tablet.goto(`${BASE}/#/map/forest-trails`);
  await tablet.getByRole('heading', { name: 'Forest trails needs an account' }).waitFor();
  await shot(tablet, 'closed-island');
  await read();
  await tablet.goto(`${BASE}/#/level/l06-the-other-way`);
  await tablet.waitForURL((url) => url.hash === '#/' || url.hash === '');
  await tablet.goto(`${BASE}/#/create`);
  await tablet.getByRole('heading', { name: 'Making things needs an account' }).waitFor();
  await read();
  step('a later island and Create say they need an account, and why');

  const finish = async (levelId, cards) => {
    await tablet.goto(`${BASE}/#/level/${levelId}`);
    for (const card of cards) await tablet.locator(`.palette .card-${card}`).first().click();
    await tablet.getByRole('button', { name: 'Run', exact: true }).click();
    await tablet.getByRole('heading', { name: 'You did it!' }).waitFor({ timeout: 20_000 });
  };
  await finish('l05-turn-first', ['rotateCW', 'forward', 'forward']);
  await tablet.getByText('1 level left on this island').waitFor();
  await tablet.getByRole('button', { name: 'Next level' }).waitFor();
  await read();
  await finish('l07-in-order', ['forward', 'rotateCW', 'forward']);
  await tablet.getByText('You finished the first island!').waitFor();
  if ((await tablet.getByRole('button', { name: 'Next level' }).count()) !== 0) throw new Error('A guest is offered the next level past the first island');
  if ((await tablet.getByRole('button', { name: 'Change this level' }).count()) !== 0) throw new Error('A guest is offered to change a level');
  await shot(tablet, 'end-of-island');
  await read();
  const wrong = /\b(free|unlock\w*|upgrade\w*|trial|full game)\b/i.exec(guestWords);
  if (wrong) throw new Error(`A guest's screen says "${wrong[0]}", which sounds like something to pay for`);
  await tablet.getByRole('link', { name: 'Keep going' }).click();
  await tablet.getByRole('heading', { name: 'Sign in or set up an account' }).waitFor();
  step('finishing the first island says an account comes next, in words that never suggest paying');
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
  // The stars earned before signing in come along, once the child says they are theirs.
  await tablet.getByRole('heading', { name: 'Are these yours?' }).waitFor();
  await shot(tablet, 'are-these-yours');
  await tablet.getByRole('button', { name: 'Yes, bring them' }).click();
  await until('the earlier stars on the server', async () => {
    const { docs } = await (await tablet.request.get(`${BASE}/api/sync?since=0`)).json();
    const levels = docs.find((d) => d.key === 'progress')?.value.levels ?? {};
    return levels['l05-turn-first']?.stars.complete && levels['l07-in-order']?.stars.complete;
  });
  await tablet.goto(`${BASE}/#/map/forest-trails`);
  await tablet.getByRole('heading', { name: 'Forest trails', exact: true }).waitFor();
  if ((await tablet.getByText('needs an account').count()) !== 0) throw new Error('A signed-in child is still told an island needs an account');
  await tablet.goto(`${BASE}/#/`);
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

  // ----- Feedback loops: what a child tries, says and asks -----
  await tablet.goto(`${BASE}/#/level/l03-two-steps`);
  const run = tablet.getByRole('button', { name: 'Run', exact: true });
  for (let i = 0; i < 2; i++) {
    // The level opens with one step where two are needed: the same wrong answer, twice.
    await run.click();
    // Let the robot finish its walk: a run that is reset half way is not an attempt.
    const pause = tablet.getByRole('button', { name: 'Pause', exact: true });
    await until('the run to start', () => pause.isEnabled());
    await until('the run to end', () => pause.isDisabled(), 20_000);
    await tablet.getByRole('button', { name: 'Reset', exact: true }).click();
  }
  await shot(tablet, 'two-failed-runs');
  await tablet.getByRole('button', { name: 'Add Move forward one tile' }).click();
  await run.click();
  await tablet.getByRole('heading', { name: 'You did it!' }).waitFor({ timeout: 20_000 });
  await tablet.getByRole('button', { name: 'Hard' }).click();
  await tablet.getByRole('button', { name: 'Tell us something about this level' }).click();
  await tablet.getByLabel('What do you want to tell us about this level?').fill('The second step surprised me');
  await shot(tablet, 'level-rated');
  await tablet.getByRole('button', { name: 'Send', exact: true }).click();
  await tablet.getByText('Sent. Thank you!').waitFor();
  step('a child fails a level twice, solves it, rates it hard and writes a note');

  await tablet.goto(`${BASE}/#/`);
  await tablet.getByRole('button', { name: 'Tell us' }).click();
  await tablet.getByRole('button', { name: 'I have a question' }).click();
  await tablet.getByLabel('What do you want to know?').fill('Can the robot swim?');
  await shot(tablet, 'tell-us');
  await tablet.getByRole('button', { name: 'Send', exact: true }).click();
  await tablet.getByText('We will send the answer to your grown-up.').waitFor();
  await tablet.getByRole('button', { name: 'Done' }).click();
  await until('the mail to the owner', () => /Wonderbits: (one new note|\d+ new notes)/.test(log));
  step('the child asks a question from the header, and the owner is mailed');

  // ----- The owner's page -----
  await until('the visit on the server', async () => {
    const { levels } = await (await parent.request.get(`${BASE}/api/admin/levels`)).json();
    const level = levels.find((l) => l.levelId === 'l03-two-steps');
    return level?.finished === 1 && level.ratings === 1;
  });
  await parent.goto(`${BASE}/#/admin`);
  const levelRow = parent.locator('.admin-levels tbody tr', { hasText: 'Two steps' });
  await levelRow.waitFor();
  const cells = (await levelRow.locator('td').allInnerTexts()).map((t) => t.trim());
  // Children 1, finished 100%, left 0%, three runs to solve, rated 3 (hard) by one child.
  if (cells[0] !== '1' || cells[1] !== '100%' || cells[2] !== '0%' || cells[3] !== '3.0' || !cells[6].startsWith('3.0')) throw new Error(`The level's numbers are wrong: ${cells.join(' | ')}`);
  await shot(parent, 'admin-levels');
  await levelRow.getByRole('button').click();
  await parent.getByText('1 child, 2 runs').waitFor();
  await parent.locator('.admin-code', { hasText: 'robot.forward()' }).first().waitFor();
  await parent.getByText('The second step surprised me').waitFor();
  await shot(parent, 'admin-level');
  const adminText = await parent.locator('.admin').innerText();
  if (/Robin|lee@example\.com/.test(adminText)) throw new Error('The owner\'s page names a child or a grown-up');
  await parent.getByRole('button', { name: 'All levels' }).click();
  const question = parent.locator('.note-list li', { hasText: 'Can the robot swim?' });
  await question.getByRole('textbox').fill('Not yet, but it can cross on a log.');
  await question.getByRole('button', { name: 'Send answer' }).click();
  await until('the answer in the mail', () => /An answer for Robin from Wonderbits/.test(log));
  step('the owner sees the level’s numbers, the shared wrong answer and the notes, and answers the question');

  // ----- Offline, nothing is asked; what is done is still recorded -----
  const twoSteps = async () => (await (await parent.request.get(`${BASE}/api/admin/levels`)).json()).levels.find((l) => l.levelId === 'l03-two-steps');
  const before = await twoSteps();
  await tablet.goto(`${BASE}/#/`);
  await tablet.getByRole('button', { name: 'Tell us' }).waitFor();
  await tablet.context().setOffline(true);
  await tablet.getByRole('button', { name: 'Tell us' }).waitFor({ state: 'detached' });
  await tablet.evaluate(() => (location.hash = '#/level/l03-two-steps'));
  await tablet.getByRole('button', { name: 'Add Move forward one tile' }).click();
  await run.click();
  await tablet.getByRole('heading', { name: 'You did it!' }).waitFor({ timeout: 20_000 });
  await tablet.getByRole('button', { name: 'Next level' }).waitFor();
  if ((await tablet.getByText('How was that one?').count()) !== 0) throw new Error('A level finished offline still asks how hard it was');
  await shot(tablet, 'offline-complete');
  await tablet.context().setOffline(false);
  await tablet.evaluate(() => (location.hash = '#/'));
  await tablet.getByRole('button', { name: 'Tell us' }).waitFor();
  await until('the level solved offline on the server', async () => {
    const after = await twoSteps();
    return after.visits === before.visits + 1 && after.ratings === before.ratings;
  });
  step('offline, the child is asked nothing; the level they solved is recorded and sent once back online');

  // ----- The "stuck?" nudge -----
  await tablet.goto(`${BASE}/#/level/l03-two-steps`);
  for (let i = 0; i < 5; i++) {
    await run.click();
    const pause = tablet.getByRole('button', { name: 'Pause', exact: true });
    await until('the run to start', () => pause.isEnabled());
    await until('the run to end', () => pause.isDisabled(), 20_000);
    if (i < 4) await tablet.getByRole('button', { name: 'Reset', exact: true }).click();
  }
  const nudge = tablet.getByRole('complementary', { name: 'Is this one tricky?' });
  await nudge.waitFor();
  await shot(tablet, 'stuck-nudge');
  await nudge.getByRole('button', { name: 'A bit' }).click();
  await nudge.getByRole('button', { name: 'I do not know which card to use' }).click();
  await nudge.getByText(/Thank you/).waitFor();
  await nudge.getByRole('button', { name: 'OK' }).click();
  await nudge.waitFor({ state: 'detached' });
  await tablet.goto(`${BASE}/#/`);
  await until('the stuck visit on the server', async () => {
    const detail = await (await parent.request.get(`${BASE}/api/admin/levels/l03-two-steps`)).json();
    return detail.stuck.some((s) => s.stuck === 'a-bit') && detail.quits.length === 1 && detail.notes.some((n) => n.kind === 'stuck');
  });
  step('after five failed runs the child is asked if it is tricky, and leaving the level is recorded with its last run');

  await parent.goto(`${BASE}/#/grownup`);
  await parent.getByText(/What your family has written/).waitFor();
  await parent.getByText('Not yet, but it can cross on a log.').waitFor();
  await shot(parent, 'grownup-notes');
  // The box changes once the server has agreed, so it is clicked, not "unchecked".
  await parent.getByRole('checkbox', { name: 'Help improve Wonderbits' }).click();
  await until('collection to be off', async () => (await (await parent.request.get(`${BASE}/api/parent/me`)).json()).improve === false);
  await tablet.reload();
  await tablet.locator('.who-chip').waitFor();
  if ((await tablet.getByRole('button', { name: 'Tell us' }).count()) !== 0) throw new Error('The prompts are still offered after the grown-up turned them off');
  const refusedBatch = await tablet.request.post(`${BASE}/api/insight/batch`, { data: { visits: [], attempts: [] }, headers: { Origin: BASE } });
  if (refusedBatch.status() !== 403) throw new Error(`With collection off the server still takes records: ${refusedBatch.status()}`);
  step('the answer reaches the grown-up, who turns collection off, and the prompts go away');

  // ----- Invites: the owner makes one, shares its link, and stops it -----
  await parent.goto(`${BASE}/#/admin`);
  await parent.getByLabel('How many families').fill('2');
  await parent.getByLabel('Who it is for').fill('work colleagues');
  await parent.getByRole('button', { name: 'Make invite' }).click();
  const inviteRow = parent.locator('.invite-list li', { hasText: 'work colleagues' });
  await inviteRow.getByText('0 of 2 used').waitFor();
  await shot(parent, 'admin-invites');
  const shared = (await inviteRow.locator('.invite-code').innerText()).trim();
  const colleague = await device({ width: 900, height: 900 });
  await colleague.goto(`${BASE}/#/grownup/invite/${shared}`);
  await colleague.getByText('You have been invited to Wonderbits').waitFor();
  if ((await colleague.getByLabel('Invite code').inputValue()) !== shared) throw new Error('The share link did not fill the invite code in');
  await shot(colleague, 'invited');
  await colleague.getByLabel('Your email address').fill('colleague@example.com');
  await colleague.getByRole('button', { name: 'Email me a link' }).click();
  await colleague.getByRole('heading', { name: 'Check your email' }).waitFor();
  const theirLink = await until('the colleague’s sign-in mail', () => [...log.matchAll(/mail to colleague@example\.com[\s\S]*?(http\S+\/#\/grownup\/signin\/\S+)/g)].at(-1)?.[1]);
  await colleague.goto(theirLink);
  await colleague.getByRole('heading', { name: 'Your children' }).waitFor();
  await parent.reload();
  await inviteRow.getByText('1 of 2 used').waitFor();
  await inviteRow.getByRole('button', { name: 'Stop' }).click();
  await inviteRow.getByRole('button', { name: 'Yes, stop it' }).click();
  await inviteRow.getByText('Stopped').waitFor();
  const latecomer = await device({ width: 900, height: 900 });
  await latecomer.goto(`${BASE}/#/grownup/invite/${shared}`);
  await latecomer.getByLabel('Your email address').fill('latecomer@example.com');
  await latecomer.getByRole('button', { name: 'Email me a link' }).click();
  await latecomer.getByText('That invite code is not right, or it has been used.').waitFor();
  step('the owner makes an invite for two families, a colleague joins by its link, and the stopped invite lets nobody else in');
  await parent.goto(`${BASE}/#/grownup`);
  await parent.getByRole('heading', { name: 'Your children', exact: true }).waitFor();

  // ----- Taking a device away signs its child out -----
  const row = parent.locator('.device-list li').first();
  await row.getByRole('button', { name: 'Take away' }).click();
  await row.getByRole('button', { name: 'Yes, sign it out' }).click();
  await until('one device left', async () => (await parent.locator('.device-list li').count()) === 1);
  await tablet.goto(`${BASE}/#/`);
  await tablet.reload();
  await tablet.locator('.app-header').waitFor();
  if ((await tablet.locator('.who-chip:not(.is-guest)').count()) !== 0) throw new Error('The child is still signed in on a device that was taken away');
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
