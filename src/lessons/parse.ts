/**
 * Parse untrusted content JSON into typed definitions. Content is data that
 * contributors may write by hand, so errors name the exact path at fault.
 */
import { slotOfSpec, type NodeSpec } from '../ir/spec';
import { FUNCTION_NAME, isCardId, isCommandId, isConditionId, isEventId, isSenseId, KEYS, BOARD_MAPS, parseItem, parseLength, parseRandom, parseRead, REPEAT_MAX, REPEAT_MIN, RESERVED_NAMES, VALUE_KINDS, type CardId, type ConditionId, type ItemKind, type Key, type Source, type Value, type ValueKind } from '../ir/types';
import { FACINGS, type Cell, type Facing, type Gate, type Mover, type Plate, type Switch, type TileKind, type WorldDefinition } from '../sim/types';
import { CONTENT_SCHEMA_VERSION, type MemoryField, type Activity, type ConceptIntroduction, type HintPath, type HintStep, type PackManifest, type PuzzleDefinition } from './types';

/** True when a value is of a slot's kind: a list's items of its item kind. */
export function valueFits(v: unknown, kind: ValueKind, of?: ItemKind): boolean {
  switch (kind) {
    case 'number':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0;
    case 'yesNo':
      return typeof v === 'boolean';
    case 'direction':
      return v === 'N' || v === 'E' || v === 'S' || v === 'W';
    case 'position':
      return typeof v === 'object' && v !== null && Number.isInteger((v as Cell).x) && Number.isInteger((v as Cell).y);
    case 'list':
      return Array.isArray(v) && v.every((x) => valueFits(x, of ?? 'number'));
    case 'grid':
      // Rows of items, every row as long as the first.
      return Array.isArray(v) && v.length > 0 && v.every((row) => Array.isArray(row) && row.length === (v[0] as unknown[]).length && row.every((x) => valueFits(x, of ?? 'number')));
  }
}

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
const ACTIVITIES: readonly Activity[] = ['run', 'build', 'reorder', 'debug', 'predict', 'model'];
const GATE_ID = /^[a-z]$/;

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
      if ('remember' in s) {
        if (!top) this.fail(at, 'a memory slot can only sit at the top of a program');
        return [this.remember(s, at)];
      }
      if ('set' in s) return [{ set: this.functionName(s.set, `${at}.set`), to: this.source(s.to, `${at}.to`) }];
      if ('change' in s) {
        const by = Number.isInteger(s.by) && s.by !== 0 && Math.abs(s.by as number) <= 9 ? (s.by as number) : (this.fail(`${at}.by`, 'expected a whole number from -9 to 9, not 0'), 1);
        return [{ change: this.functionName(s.change, `${at}.change`), by }];
      }
      if ('face' in s) return [{ face: this.functionName(s.face, `${at}.face`) }];
      if ('unlock' in s) return [{ unlock: this.gateId(s.unlock, `${at}.unlock`), with: this.functionName(s.with, `${at}.with`) }];
      if ('push' in s) return [{ push: this.functionName(s.push, `${at}.push`), to: this.source(s.to, `${at}.to`) }];
      if ('mark' in s) return [{ mark: this.functionName(s.mark, `${at}.mark`), at: this.place(s.at, `${at}.at`), with: this.functionName(s.with, `${at}.with`) }];
      if ('goRow' in s) return [{ goRow: this.target(s.goRow, `${at}.goRow`) }];
      if ('goColumn' in s) return [{ goColumn: this.target(s.goColumn, `${at}.goColumn`) }];
      if ('shift' in s) {
        const dir = FACINGS.includes(s.dir as Facing) ? (s.dir as Facing) : (this.fail(`${at}.dir`, 'expected N, E, S or W'), 'E');
        return [{ shift: this.functionName(s.shift, `${at}.shift`), dir }];
      }
      if ('forEach' in s) return [{ forEach: this.functionName(s.forEach, `${at}.forEach`), as: this.functionName(s.as, `${at}.as`), do: this.spec(s.do, `${at}.do`, false) }];
      if ('open' in s) return [{ open: this.gateId(s.open, `${at}.open`) }];
      if ('close' in s) return [{ close: this.gateId(s.close, `${at}.close`) }];
      if ('on' in s) {
        if (!top) this.fail(at, 'a When card can only sit at the top of a program');
        const event = isEventId(s.on) ? s.on : (this.fail(`${at}.on`, `unknown event ${JSON.stringify(s.on)}; use "stepOn:1", "acorn", "key:up" or "tick"`), 'tick');
        if (defined.has(`on:${event}`)) this.fail(`${at}.on`, `there are two When cards for ${event}`);
        defined.add(`on:${event}`);
        return [{ on: event, do: this.spec(s.do, `${at}.do`, false) }];
      }
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
      this.fail(at, 'a block needs "repeat", "if", "until", "forEach", "call", "open", "close", "set", "change", "face", "unlock", "define", "on" or "remember"');
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
    const gates = world.gates === undefined ? undefined : this.list(world.gates, `${path}.gates`, (g, at) => this.gate(g, at));
    const switches = world.switches === undefined ? undefined : this.list(world.switches, `${path}.switches`, (w, at) => this.switch(w, at));
    const plates = world.plates === undefined ? undefined : this.list(world.plates, `${path}.plates`, (p, at) => this.plate(p, at));
    const movers = world.movers === undefined ? undefined : this.list(world.movers, `${path}.movers`, (m, at) => this.mover(m, at));
    return {
      ...(gates && { gates }),
      ...(switches && { switches }),
      ...(plates && { plates }),
      ...(movers && { movers }),
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
  list<T>(v: unknown, path: string, item: (x: unknown, at: string) => T): T[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array');
      return [];
    }
    return v.map((x, i) => item(x, `${path}[${i}]`));
  }
  /** A gate: { "id": "a", "x": 2, "y": 0, "open": false }. It starts closed unless open is true. */
  gate(v: unknown, path: string): Gate {
    const o = this.obj(v, path);
    const id = typeof o.id === 'string' && GATE_ID.test(o.id) ? o.id : (this.fail(`${path}.id`, 'expected one lower case letter'), 'a');
    return {
      id,
      ...this.cell(o, path),
      open: o.open === undefined ? false : this.bool(o.open, `${path}.open`),
      ...(o.code !== undefined && { code: this.int(o.code, `${path}.code`) }),
    };
  }
  /** A memory slot: { "remember": "count", "kind": "number", "start": 0 }; a list also says what "of". */
  remember(o: Obj, path: string): Extract<NodeSpec, { remember: string }> {
    const name = this.functionName(o.remember, `${path}.remember`);
    const kind = (VALUE_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as ValueKind) : (this.fail(`${path}.kind`, `expected one of ${VALUE_KINDS.join(', ')}`), 'number');
    const of = kind === 'list' || kind === 'grid' ? (['number', 'yesNo', 'direction'].includes(o.of as string) ? (o.of as ItemKind) : (this.fail(`${path}.of`, `a ${kind} needs "of": number, yesNo or direction`), 'number')) : undefined;
    const spec: Extract<NodeSpec, { remember: string }> = { remember: name, kind, ...(of && { of }) };
    if (o.start !== undefined) {
      const map = kind === 'grid' && of === 'yesNo' && (BOARD_MAPS as readonly unknown[]).includes(o.start);
      if (!map && !valueFits(o.start, kind, of)) this.fail(`${path}.start`, `expected a ${kind}${of ? ` of ${of}` : ''} value`);
      else spec.start = o.start as Value;
    }
    return spec;
  }
  /** Where a Go card walks to: a row or column number from 0, or a number slot's name. */
  target(v: unknown, path: string): number | string {
    if (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 15) return v as number;
    if (typeof v === 'string' && FUNCTION_NAME.test(v)) return v;
    this.fail(path, 'expected a row or column number from 0 to 15, or a number slot');
    return 1;
  }
  /** Where on a grid: "here", "ahead", or a position slot's name. */
  place(v: unknown, path: string): string {
    if (typeof v === 'string' && FUNCTION_NAME.test(v)) return v;
    this.fail(path, 'expected "here", "ahead" or a position slot');
    return 'here';
  }
  /** Where a Set card's value comes from: a number, true or false, N E S or W, facing, here, acorns, or a sense. */
  source(v: unknown, path: string): Source {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 999) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string' && (['N', 'E', 'S', 'W', 'facing', 'here', 'acorns', 'acornsLeft'].includes(v) || isSenseId(v) || parseRead(v) || parseLength(v) || parseRandom(v) || parseItem(v))) return v;
    this.fail(path, `expected a value to set: a number, true or false, N, E, S or W, "facing", "here", "acorns", "acornsLeft", a sense or a random source, got ${JSON.stringify(v)}`);
    return 0;
  }
  /** A random level's outcomes: { "of": "roll", "values": [1, 2, 3] }; of is a slot or "column". */
  covers(v: unknown, path: string): { of: string; values: Value[] } {
    const o = this.obj(v, path);
    const of = typeof o.of === 'string' && FUNCTION_NAME.test(o.of) ? o.of : (this.fail(`${path}.of`, 'expected a slot name or "column"'), 'column');
    const values = Array.isArray(o.values) && o.values.length >= 2 ? (o.values as Value[]) : (this.fail(`${path}.values`, 'expected at least two outcomes'), []);
    return { of, values };
  }
  /** A switch: { "x": 1, "y": 0, "toggles": ["a"] }. */
  switch(v: unknown, path: string): Switch {
    const o = this.obj(v, path);
    const toggles = this.list(o.toggles, `${path}.toggles`, (id, at) => (typeof id === 'string' && GATE_ID.test(id) ? id : (this.fail(at, 'expected a gate id'), 'a')));
    return { ...this.cell(o, path), toggles };
  }
  gateId(v: unknown, path: string): string {
    if (typeof v === 'string' && GATE_ID.test(v)) return v;
    this.fail(path, 'expected a gate letter');
    return 'a';
  }
  /** A plate: { "id": "1", "x": 2, "y": 0 }. */
  plate(v: unknown, path: string): Plate {
    const o = this.obj(v, path);
    const id = typeof o.id === 'string' && /^[1-9]$/.test(o.id) ? o.id : (this.fail(`${path}.id`, 'expected one digit, 1 to 9, as a string'), '1');
    return { id, ...this.cell(o, path) };
  }
  /** A mover: { "id": "log1", "kind": "log", "path": [{ "x": 2, "y": 0 }, ...] }. */
  mover(v: unknown, path: string): Mover {
    const o = this.obj(v, path);
    const kind = o.kind === 'log' || o.kind === 'beetle' ? o.kind : (this.fail(`${path}.kind`, 'expected "log" or "beetle"'), 'log');
    const cells = this.list(o.path, `${path}.path`, (c, at) => this.cell(c, at));
    if (cells.length === 0) this.fail(`${path}.path`, 'expected at least one cell');
    return { id: this.str(o.id, `${path}.id`), kind, path: cells };
  }
  /**
   * Shuffled versions of a board. Each lists only what changes (rows, the
   * robot, the goal, acorns, gates and so on); the rest is the main board's.
   */
  shuffles(v: unknown, base: unknown, path: string): WorldDefinition[] {
    return this.list(v, path, (x, at) => this.world({ ...this.obj(base, path), ...this.obj(x, at) }, at));
  }
  keys(v: unknown, path: string): Key[] {
    return this.list(v, path, (k, at) => ((KEYS as readonly unknown[]).includes(k) ? (k as Key) : (this.fail(at, 'expected "up", "down", "left" or "right"'), 'up')));
  }
  memoryField(v: unknown, path: string): MemoryField {
    if (v === 'facing' || v === 'acorns') return v;
    if (typeof v === 'string' && /^(gate:[a-z]|slot:[a-z][A-Za-z0-9]{0,19})$/.test(v)) return v as MemoryField;
    this.fail(path, `expected "facing", "acorns", "gate:<id>" or "slot:<name>", got ${JSON.stringify(v)}`);
    return 'facing';
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
        ...(demo.input !== undefined && { input: this.keys(demo.input, `${path}.demo.input`) }),
        ...(demo.shuffles !== undefined && { shuffles: this.shuffles(demo.shuffles, demo.world, `${path}.demo.shuffles`) }),
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
        const ok = FUNCTION_NAME.test(p) || (p.startsWith('on:') && isEventId(p.slice(3)));
        if (!ok) this.fail(`${path}[0]`, `expected a function name or "on:<event>", got ${JSON.stringify(p)}`);
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
    prediction = {
      askTile: r.bool(o.askTile, 'prediction.askTile'),
      ...(o.askMemory !== undefined && { askMemory: r.list(o.askMemory, 'prediction.askMemory', (f, at) => r.memoryField(f, at)) }),
    };
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
      ...(objective.memory !== undefined && { memory: r.obj(objective.memory, 'objective.memory') as Record<string, Value> }),
      ...(objective.covers !== undefined && { covers: r.covers(objective.covers, 'objective.covers') }),
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
      ...(programming.allowedSources !== undefined && {
        allowedSources: r.list(programming.allowedSources, 'programming.allowedSources', (v, at) => r.source(v, at)),
      }),
      ...(programming.maxMemory !== undefined && { maxMemory: r.int(programming.maxMemory, 'programming.maxMemory', 1) }),
      ...(programming.memoryOptions !== undefined && {
        memoryOptions: r.list(programming.memoryOptions, 'programming.memoryOptions', (o, at) => slotOfSpec(r.remember(r.obj(o, at), at))),
      }),
      starterProgram: programming.starterProgram === undefined ? [] : r.spec(programming.starterProgram, 'programming.starterProgram'),
      ...(programming.suppliedCards !== undefined && {
        suppliedCards: r.cards(programming.suppliedCards, 'programming.suppliedCards'),
      }),
    },
    ...(prediction && { prediction }),
    ...(root.inputScript !== undefined && { inputScript: r.keys(root.inputScript, 'inputScript') }),
    ...(root.shuffles !== undefined && { shuffles: r.shuffles(root.shuffles, root.world, 'shuffles') }),
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
