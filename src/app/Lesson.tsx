/**
 * One level: the play surface with the lesson around it. The lesson brings
 * the hint ladder, the stars and badges, the observation log, and the
 * child's place: an unfinished program is kept, so leaving a level (for the
 * card book, or a detour from creation mode) does not lose it. Keyed by
 * level id in App, so switching levels starts fresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RateLevel, StuckNudge } from '../insight/LevelPrompts';
import type { Insight, Visit } from '../insight/recorder';
import { countNodes, programSpec } from '../ir/program';
import type { NodeId, ProgramIR } from '../ir/types';
import { hintEffect } from '../lessons/hints';
import type { PuzzleDefinition } from '../lessons/types';
import type { ProgressStore } from '../progress/store';
import type { BadgeId, EventInput, Settings, Stars } from '../progress/types';
import type { RunOutcome, Runtime } from '../runtime/contract';
import { BADGE_INFO, BadgeIcon, Star } from './icons';
import { hashFor } from './levels';
import { PlaySurface, type Solved } from './PlaySurface';

export interface LessonProps {
  level: PuzzleDefinition;
  runtime: Runtime | null;
  store: ProgressStore;
  settings: Settings;
  nextLevelId: string | null;
  onGoTo(hash: string): void;
  /** Change this level: copy it into creation mode as the child's own. Offered once the level is solved. */
  onRemix?(): void;
  /** Feedback loops, for a signed-in child whose grown-up left them on: records the visit and its runs, and offers the prompts. */
  insight?: Insight | undefined;
  /** Whether to ask the child anything just now: false while the game is offline. The visit is recorded either way. */
  prompts?: boolean;
}

interface Completion {
  stars: Stars;
  newBadges: BadgeId[];
}

export function Lesson({ level, runtime, store, settings, nextLevelId, onGoTo, onRemix, insight, prompts = false }: LessonProps) {
  const [completion, setCompletion] = useState<Completion | null>(null);
  const completedRef = useRef(false);
  const activity = level.curriculum.activity;
  /** Levels where the child changes the program keep their place; a given program has none to keep. */
  const keepsPlace = activity === 'build' || activity === 'debug' || activity === 'reorder';
  const saved = useMemo(() => (keepsPlace ? store.draft(level.id) : undefined), [store, level.id, keepsPlace]);

  // The log: opened on mount, abandoned on unmount unless completed.
  useEffect(() => {
    store.record({ levelId: level.id, kind: 'level-opened' });
    return () => {
      if (!completedRef.current) store.record({ levelId: level.id, kind: 'level-abandoned' });
    };
  }, [store, level.id]);

  // The visit, for the feedback loops: opened with the level, left with it unless it was finished.
  const [visit, setVisit] = useState<Visit | null>(null);
  const [nudging, setNudging] = useState(false);
  useEffect(() => {
    if (!insight) return;
    const v = insight.open(level.id);
    setVisit(v);
    return () => v.leave();
  }, [insight, level.id]);
  /** After anything that might tip it over: is it time to ask whether the child is stuck? */
  const considerNudge = useCallback(() => {
    // Offline, the question is kept for later rather than used up.
    if (!prompts || !visit?.shouldAskIfStuck) return;
    visit.askedIfStuck();
    setNudging(true);
  }, [visit, prompts]);

  const record = useCallback(
    (event: EventInput) => {
      store.record(event);
      if (event.kind === 'hint-opened') visit?.hint(event.rung);
      if (event.kind === 'prediction-made') visit?.predicted(event.correct);
    },
    [store, visit],
  );
  const onAttempt = useCallback(
    ({ program, outcome, check }: { program: ProgramIR; outcome: RunOutcome; check?: 'roll' | 'unseen' }) => {
      visit?.attempt({ program: programSpec(program), cards: countNodes(program), outcome, ...(check && { check }) });
      considerNudge();
    },
    [visit, considerNudge],
  );
  const hintFor = useCallback((rung: 0 | 1 | 2, program: ProgramIR, newId: () => NodeId, full: boolean) => hintEffect(level, rung, program, newId, full), [level]);
  const onProgram = useCallback(
    (program: ProgramIR) => {
      if (keepsPlace) store.saveDraft(level.id, programSpec(program));
      visit?.edited(programSpec(program));
      considerNudge();
    },
    [store, level.id, keepsPlace, visit, considerNudge],
  );
  const onSolved = useCallback(
    ({ usedHints, steps }: Solved) => {
      const before = store.getSnapshot().progress.badges;
      const stars = store.complete({ levelId: level.id, usedHints, steps, budget: level.stars.budget });
      const after = store.getSnapshot().progress.badges;
      completedRef.current = true;
      // A solved level has no place to keep: it opens fresh next time.
      store.clearDraft(level.id);
      visit?.complete((stars.complete ? 1 : 0) + (stars.noHints ? 1 : 0) + (stars.budget === true ? 1 : 0));
      setNudging(false);
      setCompletion({ stars, newBadges: after.filter((b) => !before.includes(b)) });
    },
    [store, level, visit],
  );

  const starSlots: { key: keyof Stars; label: string }[] = [
    { key: 'complete', label: 'Reached the flag' },
    { key: 'noHints', label: 'No hints' },
    ...(level.stars.budget !== undefined ? [{ key: 'budget' as const, label: `${level.stars.budget} instructions or fewer` }] : []),
  ];

  return (
    <PlaySurface
      level={level}
      runtime={runtime}
      settings={settings}
      {...(saved && { initialProgram: saved })}
      onProgram={onProgram}
      record={record}
      hintFor={hintFor}
      onSolved={onSolved}
      onAttempt={onAttempt}
      belowControls={insight && visit && nudging && prompts ? <StuckNudge insight={insight} visit={visit} hasHints onDone={() => setNudging(false)} /> : undefined}
      completion={({ restart }) =>
        completion && (
          <div className="dialog-backdrop" role="presentation">
            <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="done-title">
              <h2 id="done-title" className="dialog-title">
                You did it!
              </h2>
              <ul className="star-row" aria-label="Stars">
                {starSlots.map(({ key, label }) => (
                  <li key={key} className={`star-slot ${completion.stars[key] ? 'is-earned' : ''}`}>
                    <Star earned={completion.stars[key] === true} size={44} />
                    <span>{label}</span>
                    <span className="visually-hidden">{completion.stars[key] ? ', earned' : ', not yet'}</span>
                  </li>
                ))}
              </ul>
              {completion.newBadges.length > 0 && (
                <ul className="new-badges" aria-label="New badges">
                  {completion.newBadges.map((b) => (
                    <li key={b} className="new-badge">
                      <span className="badge-icon">
                        <BadgeIcon id={b} />
                      </span>
                      <span>
                        New badge: <strong>{BADGE_INFO[b].name}</strong>. {BADGE_INFO[b].how}.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {insight && visit && prompts && <RateLevel insight={insight} visit={visit} />}
              <div className="dialog-actions">
                {nextLevelId && store.isUnlocked(nextLevelId) && (
                  <button type="button" className="btn btn-run" autoFocus onClick={() => onGoTo(hashFor({ screen: 'level', id: nextLevelId }))}>
                    Next level
                  </button>
                )}
                <button type="button" className="btn btn-quiet" onClick={restart}>
                  Play again
                </button>
                {onRemix && (
                  <button type="button" className="btn btn-quiet btn-create" onClick={onRemix}>
                    Change this level
                  </button>
                )}
                <a className="btn btn-quiet" href={hashFor({ screen: 'map' })}>
                  Map
                </a>
              </div>
            </section>
          </div>
        )
      }
    />
  );
}
