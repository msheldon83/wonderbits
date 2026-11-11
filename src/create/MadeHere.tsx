/** Made here: the puzzles made on this device that their makers have solved, for anyone to play. Shown on the map. */
import { Star } from '../app/icons';
import { hashFor } from '../app/levels';
import type { ProgressStore } from '../progress/store';
import { BoardThumb } from './BoardThumb';
import { playKeyOf } from './PlayScreen';
import type { Creation } from './types';

export function MadeHere({ creations, progress }: { creations: readonly Creation[]; progress: ProgressStore }) {
  const ready = creations.filter((c) => c.status === 'proved' && c.kind === 'puzzle');
  if (ready.length === 0) return null;
  return (
    <section className="made-here" aria-labelledby="made-here-title">
      <h2 id="made-here-title" className="map-title">
        Made here
      </h2>
      <ul className="shelf">
        {ready.map((c) => {
          const stars = progress.levelProgress(playKeyOf(c)).stars;
          const earned = (stars.complete ? 1 : 0) + (stars.budget ? 1 : 0);
          return (
            <li key={c.id} className="shelf-item">
              <a className="shelf-card" href={hashFor({ screen: 'play', id: c.id })} aria-label={`Play ${c.title}, ${earned} of 2 stars`}>
                <BoardThumb world={c.world} size={96} />
                <span className="shelf-title">{c.title}</span>
                <span className="map-stars" aria-hidden="true">
                  <Star earned={stars.complete} size={18} />
                  <Star earned={stars.budget === true} size={18} />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
