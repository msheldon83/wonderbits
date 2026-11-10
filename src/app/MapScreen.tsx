/**
 * The level map: the home screen, one island at a time. Each island has its
 * own sky, landmark and scenery, a stepping stone per level along a winding
 * trail with stars under each, the next open level glowing, and its own way
 * to travel on to the next island. A strip of islands across the top jumps
 * anywhere. The badge shelf sits underneath. Reads progress only.
 */
import { useEffect, useRef } from 'react';
import type { BookEntry } from '../lessons/concepts';
import { BADGE_IDS } from '../progress/types';
import type { ProgressStore } from '../progress/store';
import { BADGE_INFO, BadgeIcon, Star } from './icons';
import { mapTheme, TravelIconArt } from './mapThemes';
import { hashFor, type LevelChoice } from './levels';

const STEP_Y = 108;
const X_CENTER = 50;
const X_SWING = 30;
/** Where on the trail stone i sits, as a percentage across and pixels down. */
const stoneAt = (i: number) => ({ x: X_CENTER + X_SWING * Math.sin(i * 1.1), y: 50 + i * STEP_Y });

interface Island {
  packId: string;
  title: string;
  levels: LevelChoice[];
}

export function MapScreen({ choices, book, store, badges, packId }: { choices: LevelChoice[]; book: BookEntry[]; store: ProgressStore; badges: readonly string[]; packId?: string }) {
  const islands: Island[] = [];
  for (const c of choices) {
    const last = islands.at(-1);
    if (last?.packId === c.packId) last.levels.push(c);
    else islands.push({ packId: c.packId, title: c.packTitle, levels: [c] });
  }
  const current = choices.find((c) => store.isUnlocked(c.level.id) && !store.levelProgress(c.level.id).stars.complete)?.level.id;
  /** The stone to bring into view: the level opened most recently, or the next one to play. */
  const lastPlayed = store.lastOpenedLevelId();
  const focus = choices.some((c) => c.level.id === lastPlayed) ? lastPlayed : current;
  /** The island on screen: the one named in the address, else the one holding the stone in focus. */
  const named = islands.findIndex((i) => i.packId === packId);
  const index = named >= 0 ? named : Math.max(0, islands.findIndex((i) => i.levels.some((c) => c.level.id === focus)));
  const island = islands[index]!;
  const next = islands[index + 1];
  const prev = islands[index - 1];
  const theme = mapTheme(island.packId, index);
  const stones = useRef(new Map<string, HTMLElement>());
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Arriving on the island being played: bring its stone into view. Travelling to another: start at its landmark.
    const target = focus ? stones.current.get(focus) : undefined;
    if (target) target.scrollIntoView({ block: 'center' });
    else top.current?.scrollIntoView({ block: 'start' });
    // Only when the island changes: the map should not jump about while the child looks at it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [island.packId]);

  const done = (i: Island) => i.levels.every((c) => store.levelProgress(c.level.id).stars.complete);
  const reached = (i: Island) => store.isUnlocked(i.levels[0]!.level.id);
  const list = island.levels;
  const height = list.length * STEP_Y + 40;
  const points = list.map((_, i) => stoneAt(i));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const entry = book.find((e) => e.packId === island.packId);
  const Landmark = theme.landmark;

  return (
    <div className="map">
      <nav className="island-strip" aria-label="Islands">
        <ol>
          {islands.map((i, k) => (
            <li key={i.packId}>
              <a
                className={`island-dot ${k === index ? 'is-here' : ''} ${done(i) ? 'is-done' : ''} ${reached(i) ? '' : 'is-far'}`}
                href={hashFor({ screen: 'map', packId: i.packId })}
                aria-current={k === index ? 'page' : undefined}
                aria-label={`Island ${k + 1}: ${i.title}${done(i) ? ', finished' : reached(i) ? '' : ', not reached yet'}`}
                title={i.title}
                style={{ ['--island-sky' as string]: mapTheme(i.packId, k).sky[0], ['--island-ground' as string]: mapTheme(i.packId, k).ground }}
              >
                {k + 1}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section
        key={island.packId}
        className="island"
        aria-label={`${island.title} levels`}
        style={{ ['--island-sky' as string]: theme.sky[0], ['--island-sky-low' as string]: theme.sky[1], ['--island-ground' as string]: theme.ground }}
      >
        <div ref={top} className="island-head">
          {prev && (
            <a className="island-back" href={hashFor({ screen: 'map', packId: prev.packId })}>
              ← {prev.title}
            </a>
          )}
          <div className="island-landmark">
            <Landmark />
          </div>
          <p className="island-kicker">Island {index + 1}</p>
          <h2 className="island-title">{island.title}</h2>
          {entry && store.isUnlocked(entry.firstLevelId) && (
            <a className="map-card-link" href={hashFor({ screen: 'book', packId: entry.packId })} title={`Watch the ${entry.introduction.title} card again`}>
              {entry.introduction.title} card
            </a>
          )}
        </div>

        <div className="map-trail" style={{ height }}>
          <svg className="map-path" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={path} fill="none" stroke={theme.path} strokeOpacity={0.45} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 10" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Scenery down the side of the trail away from each stone. */}
          {points.map((p, i) => {
            const Decor = theme.decor[i % theme.decor.length]!;
            return (
              <span key={`d${i}`} className="island-decor" aria-hidden="true" style={{ left: `${p.x < X_CENTER ? 86 : 14}%`, top: p.y + (i % 2 ? 18 : -6) }}>
                <Decor />
              </span>
            );
          })}
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

        {/* The way on: each island has its own way to travel to the next. */}
        <div className="island-travel">
          {next ? (
            reached(next) ? (
              <a className="travel-button" href={hashFor({ screen: 'map', packId: next.packId })}>
                <span className="travel-icon">
                  <TravelIconArt icon={theme.travel.icon} />
                </span>
                <span className="travel-words">
                  {theme.travel.verb} <strong>{next.title}</strong>
                </span>
              </a>
            ) : (
              <p className="travel-button is-locked" aria-disabled="true">
                <span className="travel-icon">
                  <TravelIconArt icon={theme.travel.icon} />
                </span>
                <span className="travel-words">
                  Finish {island.title} to travel on to <strong>{next.title}</strong>
                </span>
              </p>
            )
          ) : (
            <p className="travel-button is-end">
              <span className="travel-icon">
                <TravelIconArt icon="flag" />
              </span>
              <span className="travel-words">The last island, for now. More are on the way.</span>
            </p>
          )}
        </div>
      </section>

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
