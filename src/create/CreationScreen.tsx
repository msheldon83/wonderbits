/**
 * One creation, in two modes on one screen. Build changes the board; Play
 * is the play surface on it, with the creation's cards. Switching is one
 * tap, and the board, the name and the program are saved as they change,
 * so nothing is lost on the way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hashFor } from '../app/levels';
import { PlaySurface, type Playable } from '../app/PlaySurface';
import { programSpec } from '../ir/program';
import type { ProgramIR } from '../ir/types';
import type { ProgressStore } from '../progress/store';
import type { EventInput, Settings } from '../progress/types';
import type { Runtime } from '../runtime/contract';
import type { WorldDefinition } from '../sim/types';
import { BoardEditor, type BoardEditorProps } from './BoardEditor';
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
}

export function CreationScreen({ creation, store, progress, runtime, settings, signposts }: CreationScreenProps) {
  /** A new thing, or one with no program yet, opens ready to be built; one being worked on opens ready to play. */
  const [mode, setMode] = useState<'build' | 'play'>(() => (creation.program.length === 0 || creation.updatedAt === creation.createdAt ? 'build' : 'play'));
  const [title, setTitle] = useState(creation.title);
  const level = useMemo(
    () => playableOf(creation, 'This island is yours. Tap an instruction to add it to your program, then press Run.'),
    // The board and rules, not the program or the name: saving those must not restart the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creation.id, creation.world, creation.objective, creation.programming],
  );
  const record = useCallback((event: EventInput) => progress.log(event), [progress]);
  const onProgram = useCallback((program: ProgramIR) => void store.update(creation.id, { program: programSpec(program) }), [store, creation.id]);
  /** The board changed since the log last heard: one line for a whole session of building, not one per tile. */
  const boardDirty = useRef(false);
  const onWorld = useCallback(
    (world: WorldDefinition) => {
      store.update(creation.id, { world });
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
  const onSolved = useCallback(() => progress.log({ levelId: creation.id, kind: 'creation-solved' }), [progress, creation.id]);

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
        <div className="mode-switch" role="group" aria-label="Build or play">
          {(['build', 'play'] as const).map((m) => (
            <button key={m} type="button" className={`btn btn-choice ${mode === m ? 'is-on' : ''}`} aria-pressed={mode === m} onClick={() => {
                logBoard();
                setMode(m);
              }}
            >
              {m === 'build' ? 'Build' : 'Play'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'build' ? (
        <BoardEditor world={creation.world} objective={creation.objective} cards={creation.programming.allowedCommands} settings={settings} onChange={onWorld} {...(signposts && { signposts })} />
      ) : (
        <PlaySurface level={level} runtime={runtime} settings={settings} initialProgram={creation.program} onProgram={onProgram} record={record} onSolved={onSolved} />
      )}
    </div>
  );
}
