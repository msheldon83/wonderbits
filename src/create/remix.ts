/**
 * Remix: a finished level becomes the child's own to change. The board and
 * the cards are copied; the limits are not, because a remix is free play
 * until its maker sets a challenge. The level itself is never altered.
 */
import { skeletonOf, splitSpec } from '../ir/spec';
import type { CardId } from '../ir/types';
import type { PuzzleDefinition } from '../lessons/types';
import { withCreationRules } from './cards';
import { TITLE_MAX, type Creation } from './types';

export function remixTitle(title: string): string {
  const suffix = ' remix';
  return title.slice(0, TITLE_MAX - suffix.length).trimEnd() + suffix;
}

export function remixOf(level: PuzzleDefinition): Omit<Creation, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'> {
  const { allowedCommands, allowedConditions, allowedSources, maxMemory, memoryOptions, suppliedCards, starterProgram } = level.programming;
  // A reorder level hands its cards out; a remix offers them like any other.
  const cards: CardId[] = [...new Set([...allowedCommands, ...(suppliedCards ?? [])])];
  // A player opens with the names the solution needs; the maker opens with what the level gave.
  const skeleton = skeletonOf(level.referenceSolution);
  const given = splitSpec(starterProgram);
  const maker = given.main.length + given.functions.length + given.handlers.length + given.memory.length > 0 ? starterProgram : skeleton;
  return {
    kind: 'puzzle',
    title: remixTitle(level.title),
    basedOn: level.id,
    status: 'draft',
    // The main board; a shuffled level's other versions are not carried over.
    world: structuredClone(level.world),
    objective: structuredClone(level.objective),
    // The level's sources stay on offer, beside creation mode's own; its maker may add names of their own.
    programming: withCreationRules({
      allowedCommands: cards,
      ...(allowedConditions && { allowedConditions: [...allowedConditions] }),
      ...(allowedSources && { allowedSources: [...allowedSources] }),
      ...(maxMemory !== undefined && { maxMemory }),
      ...(memoryOptions && { memoryOptions: structuredClone(memoryOptions) }),
      starterProgram: skeleton,
    }),
    ...(level.inputScript && { inputScript: [...level.inputScript] }),
    ...(level.days !== undefined && { days: level.days }),
    program: structuredClone(maker),
  };
}
