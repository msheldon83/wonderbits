/**
 * One creation, in three modes on one screen. Build changes the board;
 * Play is the play surface on it, with the creation's cards; Puzzle sets
 * the challenge for others and hears the critic. Switching is one
 * tap, and the board, the name and the program are saved as they change,
 * so nothing is lost on the way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hashFor } from '../app/levels';
import { PlaySurface, type Playable, type Solved } from '../app/PlaySurface';
import { randomIdFactory } from '../ir/ids';
import { programFromSpec, programSpec } from '../ir/program';
import type { ProgramIR } from '../ir/types';
import type { ProgressStore } from '../progress/store';
import type { EventInput, Settings } from '../progress/types';
import type { Runtime } from '../runtime/contract';
import type { WorldDefinition } from '../sim/types';
import type { CardId } from '../ir/types';
import { BoardEditor, type BoardEditorProps } from './BoardEditor';
import { cardsGained, inPaletteOrder } from './cards';
import { ChallengePanel } from './ChallengePanel';
import { fitsRules } from './critic';
import { KitPicker, type PackInfo } from './KitPicker';
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
  /** A new thing, or one with no program yet, opens ready to be built; one being worked on opens ready to play. */
  const [mode, setMode] = useState<'build' | 'play' | 'puzzle'>(() => (creation.program.length === 0 || creation.updatedAt === creation.createdAt ? 'build' : 'play'));
  const [title, setTitle] = useState(creation.title);
  const level = useMemo(
    () => playableOf(creation, 'This island is yours. Tap an instruction to add it to your program, then press Run.'),
    // The board and rules, not the program or the name: saving those must not restart the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creation.id, creation.world, creation.objective, creation.programming],
  );
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
        <div className="mode-switch" role="group" aria-label="Build, play or set the puzzle">
          {(['build', 'play', 'puzzle'] as const).map((m) => (
            <button key={m} type="button" className={`btn btn-choice ${mode === m ? 'is-on' : ''}`} aria-pressed={mode === m} onClick={() => {
                logBoard();
                setMode(m);
              }}
            >
              {m === 'build' ? 'Build' : m === 'play' ? 'Play' : 'Puzzle'}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-quiet btn-create" onClick={() => setPicking(true)}>
          Add cards
        </button>
        {creation.status === 'proved' && (
          <span className="ready-tag" title="You solved it, so others can play it. It is on the map, under Made here.">
            Ready to play
          </span>
        )}
      </div>
      {mode === 'build' ? (
        <BoardEditor world={creation.world} objective={creation.objective} cards={creation.programming.allowedCommands} settings={settings} onChange={onWorld} {...(signposts && { signposts })} />
      ) : mode === 'puzzle' ? (
        <ChallengePanel creation={creation} universe={universe} store={store} progress={progress} runtime={runtime} settings={settings} />
      ) : (
        <PlaySurface key={surface} level={level} runtime={runtime} settings={settings} initialProgram={creation.program} onProgram={onProgram} record={record} onSolved={onSolved} />
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
