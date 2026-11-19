/**
 * The Library: the ready-made functions a game's cards call, each with what
 * it is for, how it works a step at a time, and its code. The code shown is
 * the file that runs.
 */
import { hashFor } from '../app/levels';
import { LIBRARY } from '../library';

export function LibraryScreen({ entryId }: { entryId?: string }) {
  const shown = entryId ? LIBRARY.filter((e) => e.id === entryId) : LIBRARY;
  const entries = shown.length > 0 ? shown : LIBRARY;
  return (
    <div className="library">
      <section className="create-group">
        <h2 className="panel-title">The Library</h2>
        <p className="create-empty">
          Some cards do a big job in one go: find a line of pieces, move an enemy, open a patch of tiles. Each of those jobs is a function somebody wrote, and here they are to read. Nothing is hidden: this is the code that runs when
          the card does.
        </p>
        <nav className="choice-row" aria-label="Functions in the library">
          <a className={`btn btn-choice ${entryId ? '' : 'is-on'}`} href={hashFor({ screen: 'library' })}>
            All
          </a>
          {LIBRARY.map((e) => (
            <a key={e.id} className={`btn btn-choice ${entryId === e.id ? 'is-on' : ''}`} href={hashFor({ screen: 'library', id: e.id })}>
              {e.title}
            </a>
          ))}
        </nav>
      </section>
      {entries.map((e) => (
        <article key={e.id} className="create-group library-entry" aria-labelledby={`lib-${e.id}`}>
          <h2 id={`lib-${e.id}`} className="library-title">
            {e.title}
          </h2>
          <p className="library-call">
            <code>{e.call}</code>
          </p>
          <p className="library-about">{e.about}</p>
          <p className="rule-note">{e.usedBy}</p>
          <h3 className="rule-title">How it works</h3>
          <ol className="library-steps">
            {e.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <h3 className="rule-title">The code</h3>
          <pre className="library-code" tabIndex={0} aria-label={`The code of ${e.title}`}>
            <code>{e.source}</code>
          </pre>
        </article>
      ))}
    </div>
  );
}
