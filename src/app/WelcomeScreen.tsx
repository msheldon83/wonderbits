/**
 * Welcome: what Wonderbits is, what a child will learn and what to expect,
 * for a child to read with a grown-up beside them. It is shown by itself the
 * first time the game opens on a device, and again whenever someone asks for
 * it from Settings ("About Wonderbits").
 *
 * Wonderbits is free. Where an account is mentioned, the reason is always
 * the same one: so that what a child earns and makes is never lost.
 */
import type { LoadedPack } from '../lessons/content';
import { Robot, ROBOT_BOX } from '../render/art';
import { mapTheme } from './mapThemes';

/** What each concept is, in a child's words. A concept not listed here is named by its island instead. */
const LEARN: Record<string, string> = {
  sequencing: 'Putting steps in the right order',
  loops: 'Repeating, without writing it twice',
  conditionals: 'Choosing with "if"',
  functions: 'Making your own commands',
  worldState: 'Switches and gates',
  events: 'Reacting when something happens',
  input: 'Steering with the keys',
  time: 'Things that move by themselves',
  representation: 'Remembering with memory',
  variables: 'Keeping count',
  comparison: 'More, less and the same',
  lists: 'Lists',
  randomness: 'Chance',
  grids: 'Grids and maps',
  derived: 'Working things out from what you know',
  persistence: 'Saving for next time',
  records: 'Keeping facts together',
  objects: 'Building a team from one blueprint',
};

/** What the islands teach, in play order, each thing once. Follows the packs, so it stays true as islands are added. */
export function whatYouLearn(packs: readonly Pick<LoadedPack, 'manifest'>[]): string[] {
  const out: string[] = [];
  for (const { manifest } of packs) {
    for (const concept of manifest.concepts) {
      const words = LEARN[concept] ?? manifest.title;
      if (!out.includes(words)) out.push(words);
    }
  }
  return out;
}

export interface WelcomeProps {
  packs: readonly Pick<LoadedPack, 'manifest'>[];
  /** This copy runs with a server, so there is a page saying what is kept. */
  accounts: boolean;
  /** Nobody is signed in on a copy that has accounts: say what one is for, and offer the way in. */
  guest: boolean;
  /** Leave the welcome screen and play. */
  onDone(): void;
}

export function WelcomeScreen({ packs, accounts, guest, onDone }: WelcomeProps) {
  const first = packs[0]?.manifest;
  const Landmark = mapTheme(first?.id ?? '', 0).landmark;
  const learn = whatYouLearn(packs);
  return (
    <div className="welcome">
      <article className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-art" aria-hidden="true">
          <Landmark />
          <span className="robot welcome-robot" data-mood="happy">
            <svg width={84} height={84} viewBox={`${-ROBOT_BOX / 2} ${-ROBOT_BOX / 2} ${ROBOT_BOX} ${ROBOT_BOX}`}>
              <Robot />
            </svg>
          </span>
        </div>
        <h1 id="welcome-title" className="account-title">
          Welcome to Wonderbits
        </h1>
        <p className="account-lead">Learn to code by guiding a robot across islands.</p>

        <section aria-labelledby="welcome-what">
          <h2 id="welcome-what">What it is</h2>
          <p>You build a program out of cards, press Run, and watch the robot follow it. Every card is a real line of code, and you can look at the code whenever you like.</p>
        </section>

        <section aria-labelledby="welcome-learn">
          <h2 id="welcome-learn">What you will learn</h2>
          <p>
            There are {packs.length} islands. Each one teaches a new idea that real programmers use, a little at a time:
          </p>
          <ul className="welcome-learn">
            {learn.map((words) => (
              <li key={words}>{words}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="welcome-expect">
          <h2 id="welcome-expect">What to expect</h2>
          <ul>
            <li>Short levels that take a few minutes each.</li>
            <li>Three hints on every level, so nobody stays stuck.</li>
            <li>Stars for reaching the flag, for not needing a hint, and for short programs.</li>
            <li>A card book that keeps everything you have learned.</li>
            <li>Later on, making islands and games of your own.</li>
          </ul>
        </section>

        <section aria-labelledby="welcome-grownup">
          <h2 id="welcome-grownup">For your grown-up</h2>
          <p>
            Wonderbits is for ages 9 and up. There are no adverts and nothing to buy.{' '}
            {accounts ? <a href="#/privacy">What Wonderbits keeps</a> : 'This copy keeps everything on this device and sends nothing anywhere.'}
          </p>
        </section>

        {guest && (
          <section className="welcome-safe" aria-labelledby="welcome-safe">
            <h2 id="welcome-safe">Keeping your work safe</h2>
            <p>You can try the first island straight away. To play the rest and keep your stars and creations safe, ask your grown-up to set up an account. It is free.</p>
          </section>
        )}

        <p className="account-foot">
          <button type="button" className="btn btn-run" onClick={onDone}>
            {guest ? 'Start playing' : 'Back to the game'}
          </button>
          {guest && (
            <a className="btn btn-quiet" href="#/pair" onClick={onDone}>
              I have an account
            </a>
          )}
          {guest && (
            <a className="btn btn-quiet" href="#/grownup" onClick={onDone}>
              For the grown-up
            </a>
          )}
        </p>
      </article>
    </div>
  );
}

/** For a guest: what an account is for, and the two ways to begin. Used wherever something needs one. */
export function AskForAccount({ title, children }: { title: string; children: string }) {
  return (
    <div className="needs-account">
      <span className="needs-account-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
      </span>
      <h2 className="needs-account-title">{title}</h2>
      <p>{children}</p>
      <p className="account-foot">
        <a className="btn btn-run" href="#/pair">
          Set up an account
        </a>
        <a className="btn btn-quiet" href="#/grownup">
          For the grown-up
        </a>
      </p>
    </div>
  );
}
