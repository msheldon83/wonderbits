/**
 * Creations to and from stored JSON. The stored form writes the board the
 * way a level file does (row strings of . # and _), so reading one back
 * goes through the level parser and gets the same checks. Anything that
 * does not parse is rejected with the path of each problem.
 */
import { ContentError, parseBoardRules } from '../lessons/parse';
import type { TileKind, WorldDefinition } from '../sim/types';
import { BOARD_MAX, BOARD_MIN, CREATION_SCHEMA_VERSION, TITLE_MAX, type Creation, type CreationKind, type CreationStatus, type Proof } from './types';

const TILE_CHAR: Record<TileKind, string> = { floor: '.', wall: '#', gap: '_' };

/** A board as a level file writes it. */
export function worldToJson(world: WorldDefinition): Record<string, unknown> {
  const { width: _w, height: _h, tiles, ...rest } = world;
  return { rows: tiles.map((row) => row.map((t) => TILE_CHAR[t]).join('')), ...rest };
}

/** The cards and limits as a level file writes them: a memory option is a "remember" entry. */
function programmingToJson(programming: Creation['programming']): Record<string, unknown> {
  const { memoryOptions, ...rest } = programming;
  return { ...rest, ...(memoryOptions && { memoryOptions: memoryOptions.map(({ name, ...slot }) => ({ remember: name, ...slot })) }) };
}

export function creationToJson(c: Creation): Record<string, unknown> {
  const { world, proof, programming, ...rest } = c;
  return { ...rest, world: worldToJson(world), programming: programmingToJson(programming), ...(proof && { proof: { steps: proof.steps, provedAt: proof.provedAt } }), ...(proof && { solution: proof.solution }) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseCreation(json: unknown, source: string): Creation {
  if (!isObj(json)) throw new ContentError(source, ['$: expected an object']);
  const issues: string[] = [];
  const str = (key: string, max: number, required = true): string | undefined => {
    const v = json[key];
    if (v === undefined && !required) return undefined;
    if (typeof v === 'string' && v.length > 0 && v.length <= max) return v;
    issues.push(`${key}: expected text of 1 to ${max} characters`);
    return undefined;
  };
  const time = (v: unknown, path: string): number => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    issues.push(`${path}: expected a time in milliseconds`);
    return 0;
  };
  if (json.schemaVersion !== CREATION_SCHEMA_VERSION) issues.push(`schemaVersion: expected ${CREATION_SCHEMA_VERSION}`);
  const id = str('id', 64);
  const title = str('title', TITLE_MAX);
  const madeBy = str('madeBy', TITLE_MAX, false);
  const basedOn = str('basedOn', 64, false);
  const kind = json.kind === 'puzzle' || json.kind === 'game' ? (json.kind as CreationKind) : (issues.push('kind: expected puzzle or game'), 'puzzle' as const);
  const status = json.status === 'draft' || json.status === 'proved' ? (json.status as CreationStatus) : (issues.push('status: expected draft or proved'), 'draft' as const);
  const createdAt = time(json.createdAt, 'createdAt');
  const updatedAt = time(json.updatedAt, 'updatedAt');

  // The board, the rules and both programs get the level parser's checks.
  let rules: ReturnType<typeof parseBoardRules<'program' | 'solution'>> | undefined;
  try {
    rules = parseBoardRules(json, source, ['program', 'solution']);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
    issues.push(...e.issues);
  }
  if (rules) {
    const { width, height } = rules.world;
    if (width < BOARD_MIN || width > BOARD_MAX || height < BOARD_MIN || height > BOARD_MAX) issues.push(`world.rows: expected a board from ${BOARD_MIN} to ${BOARD_MAX} tiles each way`);
  }
  let proof: Proof | undefined;
  if (json.proof !== undefined) {
    const p = isObj(json.proof) ? json.proof : {};
    const steps = Number.isInteger(p.steps) && (p.steps as number) >= 0 ? (p.steps as number) : (issues.push('proof.steps: expected a whole number'), 0);
    proof = { solution: rules?.programs.solution ?? [], steps, provedAt: time(p.provedAt, 'proof.provedAt') };
  }
  if (status === 'proved' && !proof) issues.push('status: a proved creation needs its proof');

  if (issues.length || !rules || !id || !title) throw new ContentError(source, issues);
  const { programs, ...board } = rules;
  return {
    schemaVersion: CREATION_SCHEMA_VERSION,
    id,
    kind,
    title,
    ...(madeBy && { madeBy }),
    ...(basedOn && { basedOn }),
    createdAt,
    updatedAt,
    status,
    ...board,
    program: programs.program,
    ...(proof && { proof }),
  };
}
