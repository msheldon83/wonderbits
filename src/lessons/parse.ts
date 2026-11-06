/**
 * Parse untrusted content JSON into typed definitions. Content is data that
 * contributors may write by hand, so errors name the exact path at fault.
 */
import { isCommandId, type CommandId } from '../ir/types';
import { FACINGS, type Cell, type Facing, type TileKind } from '../sim/types';
import { CONTENT_SCHEMA_VERSION, type Activity, type HintStep, type PackManifest, type PuzzleDefinition } from './types';

export class ContentError extends Error {
  constructor(
    readonly source: string,
    readonly issues: string[],
  ) {
    super(`${source}:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ContentError';
  }
}

const TILE_CHARS: Record<string, TileKind> = { '.': 'floor', '#': 'wall', _: 'gap' };
const ACTIVITIES: readonly Activity[] = ['run', 'build', 'reorder', 'debug', 'predict'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

class Reader {
  issues: string[] = [];
  fail(path: string, msg: string): void {
    this.issues.push(`${path}: ${msg}`);
  }
  obj(v: unknown, path: string): Obj {
    if (isObj(v)) return v;
    this.fail(path, 'expected an object');
    return {};
  }
  str(v: unknown, path: string): string {
    if (typeof v === 'string' && v.length > 0) return v;
    this.fail(path, 'expected a non-empty string');
    return '';
  }
  int(v: unknown, path: string, min = 0): number {
    if (Number.isInteger(v) && (v as number) >= min) return v as number;
    this.fail(path, `expected an integer >= ${min}`);
    return min;
  }
  bool(v: unknown, path: string): boolean {
    if (typeof v === 'boolean') return v;
    this.fail(path, 'expected true or false');
    return false;
  }
  cell(v: unknown, path: string): Cell {
    const o = this.obj(v, path);
    return { x: this.int(o.x, `${path}.x`), y: this.int(o.y, `${path}.y`) };
  }
  commands(v: unknown, path: string): CommandId[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array of commands');
      return [];
    }
    return v.flatMap((c, i) => {
      if (isCommandId(c)) return [c];
      this.fail(`${path}[${i}]`, `unknown command ${JSON.stringify(c)}`);
      return [];
    });
  }
  version(v: unknown, path: string): typeof CONTENT_SCHEMA_VERSION {
    if (v !== CONTENT_SCHEMA_VERSION) this.fail(path, `expected schema version ${CONTENT_SCHEMA_VERSION}`);
    return CONTENT_SCHEMA_VERSION;
  }
  command(v: unknown, path: string): CommandId {
    if (isCommandId(v)) return v;
    this.fail(path, `unknown command ${JSON.stringify(v)}`);
    return 'forward';
  }
  hint(v: unknown, path: string): HintStep {
    const o = this.obj(v, path);
    const text = this.str(o.text, `${path}.text`);
    switch (o.kind) {
      case 'region':
        return {
          kind: 'region',
          cells: Array.isArray(o.cells) && o.cells.length > 0 ? o.cells.map((c, i) => this.cell(c, `${path}.cells[${i}]`)) : (this.fail(`${path}.cells`, 'expected at least one cell'), []),
          text,
        };
      case 'card':
        return { kind: 'card', command: this.command(o.command, `${path}.command`), text };
      case 'step':
        return { kind: 'step', index: this.int(o.index, `${path}.index`), text };
      case 'fill':
        return { kind: 'fill', slot: this.int(o.slot, `${path}.slot`), command: this.command(o.command, `${path}.command`), text };
      default:
        this.fail(`${path}.kind`, 'expected region, card, step or fill');
        return { kind: 'region', cells: [], text };
    }
  }
}

export function parsePuzzle(json: unknown, source: string): PuzzleDefinition {
  const r = new Reader();
  const root = r.obj(json, '$');
  const world = r.obj(root.world, 'world');

  const rows = Array.isArray(world.rows) ? world.rows : [];
  if (rows.length === 0) r.fail('world.rows', 'expected at least one row string');
  const width = typeof rows[0] === 'string' ? rows[0].length : 0;
  const tiles: TileKind[][] = rows.map((row, y) => {
    if (typeof row !== 'string' || row.length !== width) {
      r.fail(`world.rows[${y}]`, `expected a string of length ${width}`);
      return [];
    }
    return [...row].map((ch, x) => {
      const kind = TILE_CHARS[ch];
      if (!kind) r.fail(`world.rows[${y}][${x}]`, `unknown tile ${JSON.stringify(ch)}; use . # or _`);
      return kind ?? 'gap';
    });
  });

  const robotRaw = r.obj(world.robot, 'world.robot');
  const facing = robotRaw.facing as Facing;
  if (!FACINGS.includes(facing)) r.fail('world.robot.facing', 'expected N, E, S or W');

  const objective = r.obj(root.objective, 'objective');
  const curriculum = r.obj(root.curriculum, 'curriculum');
  const activity = curriculum.activity as Activity;
  if (!ACTIVITIES.includes(activity)) r.fail('curriculum.activity', `expected one of ${ACTIVITIES.join(', ')}`);
  const programming = r.obj(root.programming, 'programming');
  const stars = r.obj(root.stars, 'stars');
  const hintsRaw = Array.isArray(root.hints) ? root.hints : (r.fail('hints', 'expected an array of three hints'), []);
  if (hintsRaw.length !== 3) r.fail('hints', `expected exactly three hints, got ${hintsRaw.length}`);
  const hints = [0, 1, 2].map((i) => r.hint(hintsRaw[i] ?? {}, `hints[${i}]`)) as [HintStep, HintStep, HintStep];
  let prediction: PuzzleDefinition['prediction'];
  if (root.prediction !== undefined) {
    const o = r.obj(root.prediction, 'prediction');
    prediction = { askTile: r.bool(o.askTile, 'prediction.askTile') };
  }

  let maxPerCommand: Partial<Record<CommandId, number>> | undefined;
  if (programming.maxPerCommand !== undefined) {
    const raw = r.obj(programming.maxPerCommand, 'programming.maxPerCommand');
    maxPerCommand = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!isCommandId(k)) r.fail(`programming.maxPerCommand.${k}`, 'unknown command');
      else maxPerCommand[k] = r.int(v, `programming.maxPerCommand.${k}`, 1);
    }
  }

  const puzzle: PuzzleDefinition = {
    schemaVersion: r.version(root.schemaVersion, 'schemaVersion'),
    id: r.str(root.id, 'id'),
    title: r.str(root.title, 'title'),
    ...(root.intro !== undefined && { intro: r.str(root.intro, 'intro') }),
    themeId: r.str(root.themeId, 'themeId'),
    world: {
      width,
      height: rows.length,
      tiles,
      robot: { ...r.cell(robotRaw, 'world.robot'), facing },
      goal: r.cell(world.goal, 'world.goal'),
      collectibles: Array.isArray(world.collectibles)
        ? world.collectibles.map((c, i) => r.cell(c, `world.collectibles[${i}]`))
        : (r.fail('world.collectibles', 'expected an array'), []),
    },
    objective: {
      reachGoal: r.bool(objective.reachGoal, 'objective.reachGoal'),
      collectAll: r.bool(objective.collectAll, 'objective.collectAll'),
    },
    curriculum: { concept: r.str(curriculum.concept, 'curriculum.concept'), activity },
    programming: {
      allowedCommands: r.commands(programming.allowedCommands, 'programming.allowedCommands'),
      ...(programming.maxInstructions !== undefined && {
        maxInstructions: r.int(programming.maxInstructions, 'programming.maxInstructions', 1),
      }),
      ...(maxPerCommand && { maxPerCommand }),
      starterProgram: programming.starterProgram === undefined ? [] : r.commands(programming.starterProgram, 'programming.starterProgram'),
      ...(programming.suppliedCards !== undefined && {
        suppliedCards: r.commands(programming.suppliedCards, 'programming.suppliedCards'),
      }),
    },
    ...(prediction && { prediction }),
    hints,
    referenceSolution: r.commands(root.referenceSolution, 'referenceSolution'),
    stars: {
      noHints: r.bool(stars.noHints, 'stars.noHints'),
      ...(stars.budget !== undefined && { budget: r.int(stars.budget, 'stars.budget', 1) }),
    },
  };

  if (r.issues.length) throw new ContentError(source, r.issues);
  return puzzle;
}

export function parsePack(json: unknown, source: string): PackManifest {
  const r = new Reader();
  const root = r.obj(json, '$');
  const levels = Array.isArray(root.levels) ? root.levels.map((l, i) => r.str(l, `levels[${i}]`)) : [];
  if (levels.length === 0) r.fail('levels', 'expected at least one level id');
  const pack: PackManifest = {
    schemaVersion: r.version(root.schemaVersion, 'schemaVersion'),
    id: r.str(root.id, 'id'),
    title: r.str(root.title, 'title'),
    themeId: r.str(root.themeId, 'themeId'),
    levels,
  };
  if (r.issues.length) throw new ContentError(source, r.issues);
  return pack;
}
