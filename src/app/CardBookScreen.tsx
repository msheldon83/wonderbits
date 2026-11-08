/**
 * The card book: every concept the robot has learned, one page per pack,
 * with the sentence and a way to watch the introduction again. Pages for
 * islands the child has not reached yet stay closed, with a note saying
 * which island opens them.
 */
import { useEffect } from 'react';
import type { BookEntry } from '../lessons/concepts';
import type { ProgressStore } from '../progress/store';
import { hashFor } from './levels';

export function CardBookScreen({ book, store, from }: { book: BookEntry[]; store: ProgressStore; from: string }) {
  useEffect(() => {
    store.record({ levelId: from, kind: 'card-book-opened' });
  }, [store, from]);

  return (
    <div className="book">
      <p className="book-lead">Every new card the robot has learned, with a demo you can watch again.</p>
      <ol className="book-list">
        {book.map((entry) => {
          const open = store.isUnlocked(entry.firstLevelId);
          return (
            <li key={entry.packId} className={`book-entry ${open ? '' : 'is-locked'}`}>
              <div className="book-entry-text">
                <h2 className="book-entry-title">{entry.introduction.title}</h2>
                <p className="book-entry-pack">{entry.packTitle}</p>
                {open ? (
                  <p className="book-entry-explanation">{entry.introduction.explanation}</p>
                ) : (
                  <p className="book-entry-explanation">Reach the {entry.packTitle} island to open this card.</p>
                )}
              </div>
              {open ? (
                <a className="btn btn-quiet" href={hashFor({ screen: 'book', packId: entry.packId })}>
                  Watch
                </a>
              ) : (
                <span className="book-lock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="26" height="26">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
