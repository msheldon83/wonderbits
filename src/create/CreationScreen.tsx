/**
 * One creation, open on the play surface: the child's board with the cards
 * of free play. The name and the program are saved as they change.
 */
import { useCallback, useMemo, useState } from 'react';
import { hashFor } from '../app/levels';
import { PlaySurface, type Playable } from '../app/PlaySurface';
import { programSpec } from '../ir/program';
import type { ProgramIR } from '../ir/types';
import type { ProgressStore } from '../progress/store';
import type { EventInput, Settings } from '../progress/types';
import type { Runtime } from '../runtime/contract';
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
}

export function CreationScreen({ creation, store, progress, runtime, settings }: CreationScreenProps) {
  const [title, setTitle] = useState(creation.title);
  /** The program the surface opens with: the maker's own, as it was when this screen opened. */
  const [opened] = useState(creation.program);
  const level = useMemo(
    () => playableOf(creation, 'This island is yours. Tap an instruction to add it to your program, then press Run.'),
    // The board and rules, not the program or the name: saving those must not restart the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creation.id, creation.world, creation.objective, creation.programming],
  );
  const record = useCallback((event: EventInput) => progress.log(event), [progress]);
  const onProgram = useCallback((program: ProgramIR) => void store.update(creation.id, { program: programSpec(program) }), [store, creation.id]);
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
      </div>
      <PlaySurface level={level} runtime={runtime} settings={settings} initialProgram={opened} onProgram={onProgram} record={record} onSolved={onSolved} />
    </div>
  );
}
