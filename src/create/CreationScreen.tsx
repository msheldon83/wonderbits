/**
 * One creation, made in three steps on one screen. Board lays out the
 * island. Mechanics is how the puzzle works, all in view at once: the
 * board, the rules for players (the goal, the cards, the named parts, the
 * limits) and the maker's own solution, which proves it can be solved.
 * Preview is the puzzle as a player will meet it. Switching is one
 * tap, and the board, the name and the program are saved as they change,
 * so nothing is lost on the way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hashFor } from '../app/levels';
import { eventsOf, PlaySurface, type Playable, type Solved } from '../app/PlaySurface';
import { randomIdFactory } from '../ir/ids';
import { skeletonOf } from '../ir/spec';
import { programFromSpec, programSpec } from '../ir/program';
import type { ProgramIR } from '../ir/types';
import type { ProgressStore } from '../progress/store';
import type { EventInput, Settings } from '../progress/types';
import type { Runtime } from '../runtime/contract';
import type { WorldDefinition } from '../sim/types';
import type { CardId } from '../ir/types';
import { BoardEditor, type BoardEditorProps } from './BoardEditor';
import { cardsGained, inPaletteOrder } from './cards';
import { RulesColumn } from './RulesColumn';
import { useCritic } from './useCritic';
import { fitsRules } from './critic';
import { KitPicker, type PackInfo } from './KitPicker';
import { goalWords } from './goal';
import type { CreationStore } from './store';
import { TITLE_MAX, type Creation } from './types';

/** A creation as the play surface plays it: a build level with no hints and no stars. */
export function playableOf(creation: Creation, intro: string): Playable {
  return {
    id: creation.id,
    themeId: 'forest',
    world: creation.world,
    objective: creation.objective,
    programming: creation.programming,
    curriculum: { activity: 'build' },
    intro,
    ...(creation.inputScript && { inputScript: creation.inputScript }),
    ...(creation.days && { days: creation.days }),
  };
}

type Step = 'board' | 'mechanics' | 'preview';
const STEPS: { id: Step; label: string; about: string }[] = [
  { id: 'board', label: 'Board', about: 'Lay out the island: its size, tiles and everything on it' },
  { id: 'mechanics', label: 'Mechanics', about: 'How the puzzle works: the rules for players, and your own solution' },
  { id: 'preview', label: 'Preview', about: 'The puzzle as a player will see it' },
];

export interface CreationScreenProps {
  creation: Creation;
  store: CreationStore;
  progress: ProgressStore;
  runtime: Runtime | null;
  settings: Settings;
  signposts?: BoardEditorProps['signposts'];
  /** Every card this creation may offer a player. */
  universe: readonly CardId[];
  /** Each pack's name, place on the map and whether it is finished, for signposts. */
  packs: Readonly<Record<string, PackInfo>>;
}

export function CreationScreen({ creation, store, progress, runtime, settings, signposts, universe, packs }: CreationScreenProps) {
  const [picking, setPicking] = useState(false);
  /** Bumped when a kit changes the program from outside the play surface, so the surface opens afresh on it. */
  const [surface, setSurface] = useState(0);
  /** A new thing opens on its board; one being worked on opens on its mechanics. */
  const [step, setStep] = useState<Step>(() => (creation.program.length === 0 || creation.updatedAt === creation.createdAt ? 'board' : 'mechanics'));
  const [title, setTitle] = useState(creation.title);
  const level = useMemo(
    () => playableOf(creation, 'Set the rules, then solve it yourself and press Run.'),
    // The board and rules, not the program or the name: saving those must not restart the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creation.id, creation.world, creation.objective, creation.programming],
  );
  // Preview: the puzzle as a player meets it. The maker's names, empty; the maker's cards and limit; the goal in words.
  const preview = useMemo(
    () => ({ ...playableOf(creation, `${goalWords(creation)} Tap an instruction to add it to your program.`), programming: { ...creation.programming, starterProgram: skeletonOf(creation.program) } }),
    // Taken when the step opens (the surface is keyed by it), so the maker's later edits do not restart a preview in play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creation.id, creation.world, creation.objective, creation.programming, creation.days, step],
  );
  const critic = useCritic(creation, step === 'mechanics' ? runtime : null, store, progress);
  const record = useCallback((event: EventInput) => progress.log(event), [progress]);
  /** The program as it was at the last save, to see which named parts are new. */
  const lastProgram = useRef<ProgramIR | null>(null);
  const onProgram = useCallback(
    (program: ProgramIR) => {
      const now = store.get(creation.id);
      if (!now) return;
      let before = lastProgram.current;
      if (!before) {
        try {
          before = programFromSpec(now.program, randomIdFactory());
        } catch {
          before = program;
        }
      }
      lastProgram.current = program;
      // A part the maker just added brings its cards: a function its call, a number Set and Add.
      const gained = cardsGained(before, program, now.programming.allowedCommands);
      store.update(creation.id, { program: programSpec(program), ...(gained.length > 0 && { programming: { ...now.programming, allowedCommands: inPaletteOrder([...now.programming.allowedCommands, ...gained]) } }) });
    },
    [store, creation.id],
  );
  /** The board changed since the log last heard: one line for a whole session of building, not one per tile. */
  const boardDirty = useRef(false);
  const onWorld = useCallback(
    (world: WorldDefinition) => {
      const now = store.get(creation.id);
      // The first beetle or log makes time matter: the Wait card comes with it.
      const timed = (world.movers?.length ?? 0) > 0 && (now?.world.movers?.length ?? 0) === 0 && now && !now.programming.allowedCommands.includes('wait');
      store.update(creation.id, { world, ...(timed && { programming: { ...now.programming, allowedCommands: inPaletteOrder([...now.programming.allowedCommands, 'wait']) } }) });
      boardDirty.current = true;
    },
    [store, creation.id],
  );
  const logBoard = useCallback(() => {
    if (!boardDirty.current) return;
    boardDirty.current = false;
    const world = store.get(creation.id)?.world;
    if (world) progress.log({ levelId: creation.id, kind: 'board-changed', width: world.width, height: world.height });
  }, [store, progress, creation.id]);
  useEffect(() => logBoard, [logBoard]);
  /** A run that solves it within the puzzle's own cards and limit is the maker's proof. */
  const onSolved = useCallback(
    ({ program, steps }: Solved) => {
      progress.log({ levelId: creation.id, kind: 'creation-solved' });
      const now = store.get(creation.id);
      if (!now || !fitsRules(now.programming, program)) return;
      store.prove(creation.id, programSpec(program), steps);
      progress.log({ levelId: creation.id, kind: 'puzzle-proved', steps });
    },
    [progress, store, creation.id],
  );

  return (
    <div className="creation">
      <div className="creation-bar">
        <a className="btn btn-quiet" href={hashFor({ screen: 'create' })}>
          My things
        </a>
        <label className="creation-name">
          <span className="visually-hidden">Name</span>
          <input
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitle(store.update(creation.id, { title })?.title ?? title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <ol className="step-switch" aria-label="Steps of making a puzzle">
          {STEPS.map(({ id, label, about }, i) => (
            <li key={id}>
              <button
                type="button"
                className={`btn btn-choice step-button ${step === id ? 'is-on' : ''}`}
                aria-current={step === id ? 'step' : undefined}
                title={about}
                onClick={() => {
                  logBoard();
                  setStep(id);
                }}
              >
                <span className="step-number" aria-hidden="true">
                  {i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        {creation.status === 'proved' ? (
          <span className="ready-tag" title="You solved it, so others can play it. It is on the map, under Made here.">
            Ready to play
          </span>
        ) : (
          <span className="ready-tag is-draft" title="Solve it yourself in Mechanics, within its own rules, and others can play it.">
            Not solved yet
          </span>
        )}
      </div>
      {step === 'board' && <BoardEditor world={creation.world} objective={creation.objective} cards={creation.programming.allowedCommands} settings={settings} onChange={onWorld} {...(signposts && { signposts })} />}
      {step === 'mechanics' && (
        <PlaySurface
          key={surface}
          level={level}
          runtime={runtime}
          settings={settings}
          initialProgram={creation.program}
          onProgram={onProgram}
          record={record}
          onSolved={onSolved}
          programLabel="Your solution"
          programNote="Solve your own puzzle here, with the cards the player gets. It proves the puzzle can be solved. The player never sees it."
          lockNames
          middle={({ program, edit, locked }) => (
            <RulesColumn creation={creation} universe={universe} store={store} progress={progress} program={program} edit={edit} locked={locked} events={eventsOf(creation.world)} critique={critic.critique} onAddSets={() => setPicking(true)} />
          )}
          belowControls={
            <section className={`critic-strip ${critic.thinking ? 'is-thinking' : ''}`} aria-label="What the critic says" aria-busy={critic.thinking}>
              <h3 className="rule-title">The critic says</h3>
              {critic.lines.length === 0 ? (
                <p className="rule-note">{critic.thinking ? 'Trying your puzzle…' : 'The critic could not check this puzzle.'}</p>
              ) : (
                <ul className="critic-lines">
                  {critic.lines.map((l) => (
                    <li key={l.text} className={`critic-line tone-${l.tone}`}>
                      {l.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          }
        />
      )}
      {step === 'preview' && (
        <>
          <p className="preview-note" role="note">
            This is what a player sees: your island, your cards, an empty program. {creation.status === 'proved' ? 'It is on the map, under Made here.' : 'It goes on the map once you have solved it in Mechanics, or here.'}
          </p>
          <PlaySurface key="preview" level={preview} runtime={runtime} settings={settings} record={record} onSolved={onSolved} lockNames />
        </>
      )}
      {picking && (
        <KitPicker
          creation={creation}
          packs={packs}
          onClose={() => setPicking(false)}
          onAdd={(kit, patch) => {
            const { days, ...rest } = patch;
            store.update(creation.id, { ...rest, ...(days !== undefined && { days }) });
            progress.log({ levelId: creation.id, kind: 'kit-added', kit: kit.id });
            lastProgram.current = null;
            setSurface((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
