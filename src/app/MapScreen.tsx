/**
 * The level map: the home screen. One stepping stone per level along a
 * winding path, stars under each, the next open level glowing, and the
 * badge shelf. Reads progress only.
 */
import { useEffect, useRef } from 'react';
import { BADGE_IDS } from '../progress/types';
import type { ProgressStore } from '../progress/store';
import { BADGE_INFO, BadgeIcon, Star } from './icons';
import { hashFor, type LevelChoice } from './levels';

const STEP_Y = 108;
const X_CENTER = 50;
const X_SWING = 30;

export function MapScreen({ choices, store, badges }: { choices: LevelChoice[]; store: ProgressStore; badges: readonly string[] }) {
  const packs = new Map<string, LevelChoice[]>();
  for (const c of choices) packs.set(c.packTitle, [...(packs.get(c.packTitle) ?? []), c]);
  const current = choices.find((c) => store.isUnlocked(c.level.id) && !store.levelProgress(c.level.id).stars.complete)?.level.id;
  /** The stone to bring into view: the level opened most recently, or the next one to play. */
  const lastPlayed = store.lastOpenedLevelId();
  const focus = choices.some((c) => c.level.id === lastPlayed) ? lastPlayed : current;
  const stones = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (focus) stones.current.get(focus)?.scrollIntoView({ block: 'center' });
    // Only on arrival: the map should not jump about while the child looks at it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="map">
      {[...packs.entries()].map(([title, list]) => {
        const height = list.length * STEP_Y + 40;
        const points = list.map((_, i) => ({ x: X_CENTER + X_SWING * Math.sin(i * 1.1), y: 50 + i * STEP_Y }));
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return (
          <section key={title} className="map-pack" aria-label={`${title} levels`}>
            <h2 className="map-title">{title}</h2>
            <div className="map-trail" style={{ height }}>
              <svg className="map-path" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
                <path d={path} fill="none" stroke="rgba(138, 106, 74, 0.35)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 10" vectorEffect="non-scaling-stroke" />
              </svg>
              <ol className="map-stones">
                {list.map((c, i) => {
                  const p = store.levelProgress(c.level.id);
                  const unlocked = store.isUnlocked(c.level.id);
                  const isCurrent = c.level.id === current;
                  const stars = [p.stars.complete, p.stars.noHints, p.stars.budget === true];
                  const starCount = c.level.stars.budget === undefined ? 2 : 3;
                  const label = `Level ${c.number}: ${c.level.title}${unlocked ? '' : ', locked'}${p.stars.complete ? `, ${stars.filter(Boolean).length} of ${starCount} stars` : ''}`;
                  return (
                    <li
                      key={c.level.id}
                      ref={(el) => {
                        if (el) stones.current.set(c.level.id, el);
                        else stones.current.delete(c.level.id);
                      }}
                      className="map-stone-wrap"
                      style={{ left: `${points[i]!.x}%`, top: points[i]!.y }}
                    >
                      <a
                        className={`map-stone ${unlocked ? '' : 'is-locked'} ${isCurrent ? 'is-current' : ''} ${p.stars.complete ? 'is-done' : ''}`}
                        href={unlocked ? hashFor({ screen: 'level', id: c.level.id }) : undefined}
                        aria-disabled={!unlocked}
                        aria-label={label}
                        onClick={(e) => !unlocked && e.preventDefault()}
                      >
                        <span className="map-stone-number" aria-hidden="true">
                          {unlocked ? (
                            c.number
                          ) : (
                            <svg viewBox="0 0 24 24" width="22" height="22">
                              <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      </a>
                      <span className="map-stone-title" aria-hidden="true">
                        {c.level.title}
                      </span>
                      <span className="map-stars" aria-hidden="true">
                        {stars.slice(0, starCount).map((earned, k) => (
                          <Star key={k} earned={earned} size={18} />
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        );
      })}

      <section className="badge-shelf" aria-label="Badges">
        <h2 className="map-title">Badges</h2>
        <ul className="badge-list">
          {BADGE_IDS.map((id) => {
            const earned = badges.includes(id);
            return (
              <li key={id} className={`badge ${earned ? 'is-earned' : ''}`} title={BADGE_INFO[id].how}>
                <span className="badge-icon">
                  <BadgeIcon id={id} />
                </span>
                <span className="badge-name">{BADGE_INFO[id].name}</span>
                <span className="badge-how">{earned ? BADGE_INFO[id].how : '?'}</span>
                <span className="visually-hidden">{earned ? 'earned' : 'not yet earned'}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
