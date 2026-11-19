/**
 * Starter games: small whole games a child opens, plays, and changes. Each
 * is content, a JSON file under content/starters, read with the same
 * checks as a creation. A starter carries a recorded play that wins it, so
 * CI can prove every starter works by playing the recording back.
 */
import type { NodeSpec } from '../ir/spec';
import { KEYS, type Key } from '../ir/types';
import { ContentError, parseBoardRules } from '../lessons/parse';
import type { LiveInput } from '../runtime/contract';
import { withCreationRules } from './cards';
import { CLOCKS, TRIES_MAX, TRY_LENGTH, type Creation } from './types';

const files = import.meta.glob('/content/starters/*.json', { eager: true, import: 'default' });

export type Family = 'real-time' | 'turn-based';

export interface Starter {
  id: string;
  title: string;
  /** One sentence in kid terms: what the game is. */
  blurb: string;
  /** How to play, said to the player before the first go. */
  how: string;
  family: Family;
  world: Creation['world'];
  objective: Creation['objective'];
  programming: Creation['programming'];
  clock?: number;
  hideRobot?: boolean;
  program: NodeSpec[];
  /** Things to try changing, smallest first. */
  tries: string[];
  /** A play that wins the game as it ships. */
  replay: { inputs: LiveInput[]; seed: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Inputs written short in a starter file: "up" is a key, "." a tick, "2,0" a tap on column 2, row 0. */
export function readInputs(v: unknown, issues: string[]): LiveInput[] {
  if (!Array.isArray(v)) {
    issues.push('replay.inputs: expected a list');
    return [];
  }
  return v.flatMap((raw, i): LiveInput[] => {
    if (raw === '.') return [{ kind: 'tick' }];
    if ((KEYS as readonly unknown[]).includes(raw)) return [{ kind: 'key', key: raw as Key }];
    const tap = typeof raw === 'string' ? /^(\d{1,2}),(\d{1,2})$/.exec(raw) : null;
    if (tap) return [{ kind: 'tap', x: Number(tap[1]), y: Number(tap[2]) }];
    issues.push(`replay.inputs[${i}]: expected a key, "." for a tick, or "x,y" for a tap`);
    return [];
  });
}

export function parseStarter(json: unknown, source: string): Starter {
  if (!isObj(json)) throw new ContentError(source, ['$: expected an object']);
  const issues: string[] = [];
  const text = (key: string, max: number): string => {
    const v = json[key];
    if (typeof v === 'string' && v.length > 0 && v.length <= max) return v;
    issues.push(`${key}: expected text of 1 to ${max} characters`);
    return '';
  };
  const id = text('id', 40);
  const title = text('title', 40);
  const blurb = text('blurb', 200);
  const how = text('how', 240);
  const family = json.family === 'real-time' || json.family === 'turn-based' ? json.family : (issues.push('family: expected real-time or turn-based'), 'turn-based' as const);
  let rules: ReturnType<typeof parseBoardRules<'program'>> | undefined;
  try {
    rules = parseBoardRules(json, source, ['program']);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
    issues.push(...e.issues);
  }
  let clock: number | undefined;
  if (json.clock !== undefined) {
    if ((CLOCKS as readonly unknown[]).includes(json.clock)) clock = json.clock as number;
    else issues.push(`clock: expected one of ${CLOCKS.join(', ')}`);
  }
  const tries = Array.isArray(json.tries) && json.tries.length >= 1 && json.tries.length <= TRIES_MAX && json.tries.every((t) => typeof t === 'string' && t.length > 0 && t.length <= TRY_LENGTH) ? (json.tries as string[]) : (issues.push(`tries: expected 1 to ${TRIES_MAX} sentences`), []);
  const replayRaw = isObj(json.replay) ? json.replay : (issues.push('replay: expected a recorded play that wins'), {});
  const inputs = readInputs(replayRaw.inputs, issues);
  const seed = Number.isInteger(replayRaw.seed) ? (replayRaw.seed as number) : (issues.push('replay.seed: expected a whole number'), 0);
  if (issues.length || !rules) throw new ContentError(source, issues);
  return {
    id,
    title,
    blurb,
    how,
    family,
    world: rules.world,
    objective: rules.objective,
    programming: withCreationRules(rules.programming),
    ...(clock !== undefined && { clock }),
    ...(json.hideRobot === true && { hideRobot: true }),
    program: rules.programs.program,
    tries,
    replay: { inputs, seed },
  };
}

/** Every starter game, real-time first, in file order within a family. */
export function loadStarters(): Starter[] {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, json]) => parseStarter(json, path))
    .sort((a, b) => (a.family === b.family ? 0 : a.family === 'real-time' ? -1 : 1));
}

/** A starter as a child's own game: theirs to play and to change. It keeps the winning play, so it starts ready to play. */
export function gameFrom(starter: Starter, title: string): Omit<Creation, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'> {
  return {
    kind: 'game',
    title,
    basedOn: `starter:${starter.id}`,
    status: 'draft',
    world: structuredClone(starter.world),
    objective: structuredClone(starter.objective),
    programming: structuredClone(starter.programming),
    ...(starter.clock !== undefined && { clock: starter.clock }),
    ...(starter.hideRobot && { hideRobot: true }),
    program: structuredClone(starter.program),
    how: starter.how,
    tries: [...starter.tries],
    replay: structuredClone(starter.replay),
  };
}
