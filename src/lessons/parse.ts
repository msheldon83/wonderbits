/**
 * Parse untrusted content JSON into typed definitions. Content is data that
 * contributors may write by hand, so errors name the exact path at fault.
 */
import type { NodeSpec } from '../ir/spec';
import { FUNCTION_NAME, isCardId, isCommandId, isConditionId, REPEAT_MAX, REPEAT_MIN, RESERVED_NAMES, type CardId, type ConditionId } from '../ir/types';
import { FACINGS, type Cell, type Facing, type TileKind, type WorldDefinition } from '../sim/types';
import { CONTENT_SCHEMA_VERSION, type Activity, type ConceptIntroduction, type HintPath, type HintStep, type PackManifest, type PuzzleDefinition } from './types';

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
  cards(v: unknown, path: string): CardId[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array of cards');
      return [];
    }
    return v.flatMap((c, i) => {
      if (isCardId(c)) return [c];
      this.fail(`${path}[${i}]`, `unknown card ${JSON.stringify(c)}`);
      return [];
    });
  }
  conditions(v: unknown, path: string): ConditionId[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array of conditions');
      return [];
    }
    return v.flatMap((c, i) => {
      if (isConditionId(c)) return [c];
      this.fail(`${path}[${i}]`, `unknown condition ${JSON.stringify(c)}`);
      return [];
    });
  }
  condition(v: unknown, path: string): ConditionId {
    if (isConditionId(v)) return v;
    this.fail(path, `unknown condition ${JSON.stringify(v)}`);
    return 'blockedAhead';
  }
  functionName(v: unknown, path: string): string {
    if (typeof v === 'string' && FUNCTION_NAME.test(v) && !RESERVED_NAMES.has(v)) return v;
    this.fail(path, `expected a function name: a short lower camel case word that is not a reserved word, got ${JSON.stringify(v)}`);
    return 'f';
  }
  /**
   * A program spec: commands as strings, blocks as objects with a "do" list,
   * calls as { "call": name }, and at the top only, functions as
   * { "define": name, "do": [...] }.
   */
  spec(v: unknown, path: string, top = true): NodeSpec[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array of commands and blocks');
      return [];
    }
    const defined = new Set<string>();
    return v.flatMap((s, i): NodeSpec[] => {
      const at = `${path}[${i}]`;
      if (typeof s === 'string') {
        if (isCommandId(s)) return [s];
        this.fail(at, `unknown command ${JSON.stringify(s)}; blocks are objects like { "repeat": 3, "do": [...] }`);
        return [];
      }
      if (!isObj(s)) {
        this.fail(at, 'expected a command name or a block object');
        return [];
      }
      if ('call' in s) return [{ call: this.functionName(s.call, `${at}.call`) }];
      if ('define' in s) {
        if (!top) this.fail(at, 'a function can only be defined at the top of a program');
        const name = this.functionName(s.define, `${at}.define`);
        if (defined.has(name)) this.fail(`${at}.define`, `function ${name} is defined twice`);
        defined.add(name);
        return [{ define: name, do: this.spec(s.do, `${at}.do`, false) }];
      }
      const body = this.spec(s.do, `${at}.do`, false);
      if ('repeat' in s) {
        const count = this.int(s.repeat, `${at}.repeat`, REPEAT_MIN);
        if (count > REPEAT_MAX) this.fail(`${at}.repeat`, `expected a count of at most ${REPEAT_MAX}`);
        return [{ repeat: count, do: body }];
      }
      if ('until' in s) return [{ until: this.condition(s.until, `${at}.until`), do: body }];
      if ('if' in s) {
        const node: NodeSpec = { if: this.condition(s.if, `${at}.if`), do: body };
        if (s.else !== undefined) node.else = this.spec(s.else, `${at}.else`, false);
        return [node];
      }
      this.fail(at, 'a block needs "repeat", "if", "until", "call" or "define"');
      return [];
    });
  }
  /** A board: row strings of . # and _, the robot's start pose, the goal and the acorns. */
  world(v: unknown, path: string): WorldDefinition {
    const world = this.obj(v, path);
    const rows = Array.isArray(world.rows) ? world.rows : [];
    if (rows.length === 0) this.fail(`${path}.rows`, 'expected at least one row string');
    const width = typeof rows[0] === 'string' ? rows[0].length : 0;
    const tiles: TileKind[][] = rows.map((row, y) => {
      if (typeof row !== 'string' || row.length !== width) {
        this.fail(`${path}.rows[${y}]`, `expected a string of length ${width}`);
        return [];
      }
      return [...row].map((ch, x) => {
        const kind = TILE_CHARS[ch];
        if (!kind) this.fail(`${path}.rows[${y}][${x}]`, `unknown tile ${JSON.stringify(ch)}; use . # or _`);
        return kind ?? 'gap';
      });
    });
    const robotRaw = this.obj(world.robot, `${path}.robot`);
    const facing = robotRaw.facing as Facing;
    if (!FACINGS.includes(facing)) this.fail(`${path}.robot.facing`, 'expected N, E, S or W');
    return {
      width,
      height: rows.length,
      tiles,
      robot: { ...this.cell(robotRaw, `${path}.robot`), facing },
      goal: this.cell(world.goal, `${path}.goal`),
      collectibles:
        world.collectibles === undefined
          ? []
          : Array.isArray(world.collectibles)
            ? world.collectibles.map((c, i) => this.cell(c, `${path}.collectibles[${i}]`))
            : (this.fail(`${path}.collectibles`, 'expected an array'), []),
    };
  }
  /** A list of ids: concepts a pack teaches, or packs it needs first. */
  ids(v: unknown, path: string): string[] {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array of ids');
      return [];
    }
    return v.map((x, i) => this.str(x, `${path}[${i}]`));
  }
  introduction(v: unknown, path: string): ConceptIntroduction {
    const o = this.obj(v, path);
    const demo = this.obj(o.demo, `${path}.demo`);
    return {
      concept: this.str(o.concept, `${path}.concept`),
      title: this.str(o.title, `${path}.title`),
      explanation: this.str(o.explanation, `${path}.explanation`),
      demo: {
        world: this.world(demo.world, `${path}.demo.world`),
        program: this.spec(demo.program, `${path}.demo.program`),
        ...(demo.before !== undefined && { before: this.spec(demo.before, `${path}.demo.before`) }),
      },
    };
  }
  version(v: unknown, path: string): typeof CONTENT_SCHEMA_VERSION {
    if (v !== CONTENT_SCHEMA_VERSION) this.fail(path, `expected schema version ${CONTENT_SCHEMA_VERSION}`);
    return CONTENT_SCHEMA_VERSION;
  }
  card(v: unknown, path: string): CardId {
    if (isCardId(v)) return v;
    this.fail(path, `unknown card ${JSON.stringify(v)}`);
    return 'forward';
  }
  hintPath(v: unknown, path: string): HintPath {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array of indexes and "else"');
      return [];
    }
    return v.flatMap((p, i): HintPath => {
      if (Number.isInteger(p) && (p as number) >= 0) return [p as number];
      if (i === 0 && typeof p === 'string' && p !== 'else') {
        if (!FUNCTION_NAME.test(p)) this.fail(`${path}[0]`, `expected a function name, got ${JSON.stringify(p)}`);
        return [p];
      }
      if (p === 'else') {
        if (i === 0 || typeof v[i - 1] !== 'number') this.fail(`${path}[${i}]`, '"else" must follow a card index');
        return ['else'];
      }
      this.fail(`${path}[${i}]`, 'expected a card index, "else", or a function name first');
      return [];
    });
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
        return { kind: 'card', command: this.card(o.command, `${path}.command`), text };
      case 'step':
        return { kind: 'step', path: this.hintPath(o.path, `${path}.path`), index: this.int(o.index, `${path}.index`), text };
      case 'fill':
        return { kind: 'fill', path: this.hintPath(o.path, `${path}.path`), slot: this.int(o.slot, `${path}.slot`), command: this.card(o.command, `${path}.command`), text };
      default:
        this.fail(`${path}.kind`, 'expected region, card, step or fill');
        return { kind: 'region', cells: [], text };
    }
  }
}

export function parsePuzzle(json: unknown, source: string): PuzzleDefinition {
  const r = new Reader();
  const root = r.obj(json, '$');
  // A level's board must list its collectibles, even when there are none.
  const worldRaw = r.obj(root.world, 'world');
  if (worldRaw.collectibles === undefined) r.fail('world.collectibles', 'expected an array');
  const world = r.world(root.world, 'world');

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

  let maxPerCommand: Partial<Record<CardId, number>> | undefined;
  if (programming.maxPerCommand !== undefined) {
    const raw = r.obj(programming.maxPerCommand, 'programming.maxPerCommand');
    maxPerCommand = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!isCardId(k)) r.fail(`programming.maxPerCommand.${k}`, 'unknown card');
      else maxPerCommand[k] = r.int(v, `programming.maxPerCommand.${k}`, 1);
    }
  }

  const puzzle: PuzzleDefinition = {
    schemaVersion: r.version(root.schemaVersion, 'schemaVersion'),
    id: r.str(root.id, 'id'),
    title: r.str(root.title, 'title'),
    ...(root.intro !== undefined && { intro: r.str(root.intro, 'intro') }),
    themeId: r.str(root.themeId, 'themeId'),
    world,
    objective: {
      reachGoal: r.bool(objective.reachGoal, 'objective.reachGoal'),
      collectAll: r.bool(objective.collectAll, 'objective.collectAll'),
    },
    curriculum: { concept: r.str(curriculum.concept, 'curriculum.concept'), activity },
    programming: {
      allowedCommands: r.cards(programming.allowedCommands, 'programming.allowedCommands'),
      ...(programming.allowedConditions !== undefined && {
        allowedConditions: r.conditions(programming.allowedConditions, 'programming.allowedConditions'),
      }),
      ...(programming.maxInstructions !== undefined && {
        maxInstructions: r.int(programming.maxInstructions, 'programming.maxInstructions', 1),
      }),
      ...(maxPerCommand && { maxPerCommand }),
      ...(programming.maxNestingDepth !== undefined && {
        maxNestingDepth: r.int(programming.maxNestingDepth, 'programming.maxNestingDepth', 1),
      }),
      starterProgram: programming.starterProgram === undefined ? [] : r.spec(programming.starterProgram, 'programming.starterProgram'),
      ...(programming.suppliedCards !== undefined && {
        suppliedCards: r.cards(programming.suppliedCards, 'programming.suppliedCards'),
      }),
    },
    ...(prediction && { prediction }),
    hints,
    referenceSolution: r.spec(root.referenceSolution, 'referenceSolution'),
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
    order: root.order === undefined ? 0 : r.int(root.order, 'order'),
    levels,
    concepts: r.ids(root.concepts, 'concepts'),
    prerequisites: r.ids(root.prerequisites, 'prerequisites'),
    ...(root.introduction !== undefined && { introduction: r.introduction(root.introduction, 'introduction') }),
  };
  if (pack.concepts.length === 0) r.fail('concepts', 'expected at least one concept id');
  if (r.issues.length) throw new ContentError(source, r.issues);
  return pack;
}
