/**
 * Level validator. Every level must prove it is solvable within its own
 * limits before it ships; CI runs this over all content.
 */
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import { callsOfSpec, cardsOfSpec, conditionsOfSpec, countSpec, depthOfSpec, gatesOfSpec, specDiff, splitSpec, type NodeSpec } from '../ir/spec';
import { BASIC_CONDITIONS, MEMORY_CARD_IDS, isBlockId, isCommandId, isGateActionId, isSenseId, parseLength, parseRead, parseSlotTest, type CardId, type CommandId, type Key, type Source, type ValueKind } from '../ir/types';
import { interpretAll } from '../runtime/interpreter';
import { advance, cellKey, gatesOf, initialState, isTimed, moverCell, moversOf, objectiveMet, period, platesOf, stateKey, step, switchesOf, tileAt } from '../sim/world';
import { hasField } from './memory';
import { worldsOf } from './shuffles';
import { valueFits } from './parse';
import type { ObjectiveDefinition, SimState, WorldDefinition } from '../sim/types';
import { cardsTeaching } from './concepts';
import { cardOfSpec, resolveSpecPath } from './paths';
import type { ConceptIntroduction, PackManifest, PuzzleDefinition } from './types';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  /** Shortest flat program of commands that meets the objective, ignoring per-command quotas. */
  minInstructions: number | null;
}

const SEARCH_CAP = 64;

/** Breadth-first search over robot states for the shortest solving program of plain commands. */
export function shortestSolution(puzzle: PuzzleDefinition, cap = SEARCH_CAP): CommandId[] | null {
  const { world, objective, programming } = puzzle;
  const commands = programming.allowedCommands.filter(isCommandId);
  const worldPeriod = period(world);
  const keyOf = (s: SimState) => stateKey(s, worldPeriod);
  // On a timed board the world ticks after every command, as the interpreter does.
  const timed = isTimed(world);
  const act = (state: SimState, cmd: CommandId): SimState | null => {
    const r = step(world, state, cmd);
    if (r.kind !== 'ok') return null;
    if (!timed) return r.state;
    const t = advance(world, r.state);
    return t.kind === 'ok' ? t.state : null;
  };
  const start = initialState(world);
  if (objectiveMet(world, objective, start)) return [];
  let frontier: { state: SimState; path: CommandId[] }[] = [{ state: start, path: [] }];
  const seen = new Set([keyOf(start)]);
  for (let depth = 1; depth <= cap && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { state, path } of frontier) {
      for (const cmd of commands) {
        const after = act(state, cmd);
        if (!after) continue;
        const k = keyOf(after);
        if (seen.has(k)) continue;
        seen.add(k);
        const p = [...path, cmd];
        if (objectiveMet(world, objective, after)) return p;
        next.push({ state: after, path: p });
      }
    }
    frontier = next;
  }
  return null;
}

function countOf(cards: readonly string[], c: string): number {
  return cards.filter((x) => x === c).length;
}

const runOn = (world: WorldDefinition, objective: ObjectiveDefinition, spec: NodeSpec[], input?: readonly Key[]) =>
  interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world, objective, limits: { maxSteps: 1000 }, ...(input && { input }) });
const solvesOn = (world: WorldDefinition, objective: ObjectiveDefinition, spec: NodeSpec[], input?: readonly Key[]) => runOn(world, objective, spec, input).outcome.status === 'success';
/** A program solves a level only when it solves every version of the board. */
const solves = (puzzle: PuzzleDefinition, spec: NodeSpec[]) => worldsOf(puzzle).every((w) => solvesOn(w, puzzle.objective, spec, puzzle.inputScript));

/** The board itself: size, and the robot, goal and acorns on floor tiles. Shared by levels and demos. */
function validateWorld(world: WorldDefinition, objective: ObjectiveDefinition, errors: string[], gateCards = false): void {
  if (world.width < 1 || world.width > 16 || world.height < 1 || world.height > 16) {
    errors.push(`board must be 1..16 tiles on each side, got ${world.width}x${world.height}`);
  }
  if (tileAt(world, world.robot) !== 'floor') errors.push('robot must start on a floor tile');
  if (objective.reachGoal && tileAt(world, world.goal) !== 'floor') errors.push('goal must be on a floor tile');
  if (cellKey(world.robot) === cellKey(world.goal)) errors.push('robot must not start on the goal');
  const keys = world.collectibles.map(cellKey);
  if (new Set(keys).size !== keys.length) errors.push('collectibles must not share a tile');
  world.collectibles.forEach((c) => {
    if (tileAt(world, c) !== 'floor') errors.push(`collectible at ${cellKey(c)} must be on a floor tile`);
  });
  if (!objective.reachGoal && !objective.collectAll) errors.push('objective must ask for something');

  // World state: gates on floor, switches that flip real gates, and one thing per tile.
  const gates = gatesOf(world);
  const ids = gates.map((g) => g.id);
  if (new Set(ids).size !== ids.length) errors.push('gate ids must not repeat');
  const taken = new Map<string, string>([[cellKey(world.robot), 'the robot'], [cellKey(world.goal), 'the goal']]);
  world.collectibles.forEach((c) => taken.set(cellKey(c), 'an acorn'));
  const place = (cell: { x: number; y: number }, what: string) => {
    const key = cellKey(cell);
    if (tileAt(world, cell) !== 'floor') errors.push(`${what} at ${key} must be on a floor tile`);
    const there = taken.get(key);
    if (there) errors.push(`${what} at ${key} shares a tile with ${there}`);
    taken.set(key, what);
  };
  gates.forEach((g) => place(g, `gate ${g.id}`));
  switchesOf(world).forEach((sw) => {
    place(sw, 'a switch');
    if (sw.toggles.length === 0) errors.push(`the switch at ${cellKey(sw)} must flip at least one gate`);
    sw.toggles.forEach((id) => {
      if (!ids.includes(id)) errors.push(`the switch at ${cellKey(sw)} flips gate ${id}, which is not on the board`);
    });
  });
  // A gate opened by gate cards needs no switch.
  if (!gateCards) {
    gates.forEach((g) => {
      if (g.code !== undefined) return;
      if (!switchesOf(world).some((sw) => sw.toggles.includes(g.id))) errors.push(`gate ${g.id} has no switch to flip it`);
    });
  }
  const plates = platesOf(world);
  const plateIds = plates.map((p) => p.id);
  if (new Set(plateIds).size !== plateIds.length) errors.push('plate ids must not repeat');
  plates.forEach((p) => place(p, `plate ${p.id}`));

  // Movers: logs float on water, beetles walk on floor, one tile per tick, and round again.
  const moverIds = moversOf(world).map((m) => m.id);
  if (new Set(moverIds).size !== moverIds.length) errors.push('mover ids must not repeat');
  for (const m of moversOf(world)) {
    m.path.forEach((c, i) => {
      const tile = tileAt(world, c);
      if (m.kind === 'log' && tile !== 'gap') errors.push(`log ${m.id} at ${cellKey(c)} (path[${i}]) must float on water`);
      if (m.kind === 'beetle' && tile !== 'floor') errors.push(`beetle ${m.id} at ${cellKey(c)} (path[${i}]) must walk on floor`);
      const next = m.path[(i + 1) % m.path.length]!;
      if (Math.abs(next.x - c.x) + Math.abs(next.y - c.y) > 1) errors.push(`${m.kind} ${m.id} jumps from ${cellKey(c)} to ${cellKey(next)}; a path moves one tile at a time, and back to its start`);
    });
    if (m.kind === 'beetle' && cellKey(moverCell(m, 0)) === cellKey(world.robot)) errors.push(`beetle ${m.id} starts on the robot`);
  }
}

export function validatePuzzle(puzzle: PuzzleDefinition): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { world, programming, referenceSolution, stars } = puzzle;

  const gateCards = programming.allowedCommands.some((c) => isGateActionId(c) || c === 'unlock');
  validateWorld(world, puzzle.objective, errors, gateCards);
  // Shuffles: each a whole, valid board of the same size, and different from the others.
  const seenBoards = new Set([JSON.stringify(world)]);
  (puzzle.shuffles ?? []).forEach((w, i) => {
    const own: string[] = [];
    validateWorld(w, puzzle.objective, own, gateCards);
    own.forEach((e) => errors.push(`shuffles[${i}]: ${e}`));
    if (w.width !== world.width || w.height !== world.height) errors.push(`shuffles[${i}] is ${w.width} by ${w.height}; every shuffle is the main board's size`);
    if (seenBoards.has(JSON.stringify(w))) errors.push(`shuffles[${i}] is the same as another version of the board`);
    seenBoards.add(JSON.stringify(w));
  });

  if (programming.allowedCommands.length === 0) errors.push('allowedCommands must not be empty');
  const allowed = new Set<string>(programming.allowedCommands);
  const conditions = new Set<string>(programming.allowedConditions ?? BASIC_CONDITIONS);
  const usesConditions = programming.allowedCommands.some((c) => c === 'if' || c === 'ifElse' || c === 'until');
  if (usesConditions && conditions.size === 0) errors.push('allowedConditions must not be empty when If or Repeat until is allowed');
  if (!usesConditions && programming.allowedConditions) warnings.push('allowedConditions is set, but no card here senses anything');

  const checkCards = (name: string, cards: readonly string[]) => {
    cards.forEach((c, i) => {
      if (!allowed.has(c)) errors.push(`${name}[${i}] uses ${c}, which this level does not allow`);
    });
    if (programming.maxInstructions !== undefined && cards.length > programming.maxInstructions) {
      errors.push(`${name} has ${cards.length} cards, over the limit of ${programming.maxInstructions}`);
    }
    for (const [c, max] of Object.entries(programming.maxPerCommand ?? {})) {
      if (countOf(cards, c) > max!) errors.push(`${name} uses ${c} more than ${max} times`);
    }
  };
  const checkSpec = (name: string, spec: NodeSpec[]) => {
    checkCards(name, cardsOfSpec(spec));
    conditionsOfSpec(spec).forEach((c) => {
      if (!conditions.has(c)) errors.push(`${name} senses ${c}, which this level does not allow`);
    });
    if (programming.maxNestingDepth !== undefined && depthOfSpec(spec) > programming.maxNestingDepth) {
      errors.push(`${name} nests ${depthOfSpec(spec)} deep, over the limit of ${programming.maxNestingDepth}`);
    }
  };
  checkSpec('starterProgram', programming.starterProgram);
  checkSpec('referenceSolution', referenceSolution);
  if (programming.suppliedCards) checkCards('suppliedCards', programming.suppliedCards);

  worldsOf(puzzle).forEach((w, i) => {
    const outcome = runOn(w, puzzle.objective, referenceSolution, puzzle.inputScript).outcome;
    if (outcome.status !== 'success') errors.push(`referenceSolution does not solve ${i === 0 ? 'the level' : `shuffles[${i - 1}]`} (outcome: ${outcome.status})`);
  });

  validateFunctions(puzzle, errors);
  validateHandlers(puzzle, errors);
  validateMemory(puzzle, errors);
  validateActivity(puzzle, errors);
  validateHints(puzzle, errors);

  /** Levels that need more than a flat list: blocks, functions, When cards, gate cards or a key script. */
  const structured =
    programming.allowedCommands.some((c) => isBlockId(c) || c === 'call' || isGateActionId(c) || (MEMORY_CARD_IDS as readonly string[]).includes(c)) ||
    splitSpec(referenceSolution).handlers.length > 0 ||
    puzzle.inputScript !== undefined ||
    puzzle.shuffles !== undefined;
  /** Levels where the child writes the program; elsewhere a shorter flat program is no concern. */
  const open = puzzle.curriculum.activity === 'build' || puzzle.curriculum.activity === 'reorder';
  const refCount = countSpec(referenceSolution);
  const shortest = shortestSolution(puzzle);
  // A flat program that breaks a per-card quota is no way round the blocks, so it does not count.
  const withinQuotas = shortest !== null && !puzzle.shuffles && Object.entries(programming.maxPerCommand ?? {}).every(([c, max]) => countOf(shortest, c) <= max!);
  const min = shortest?.length ?? null;
  if (min === null && !structured) {
    errors.push(`no solution of ${SEARCH_CAP} commands or fewer exists`);
  } else if (min !== null && !structured) {
    if (programming.maxInstructions !== undefined && programming.maxInstructions < min) {
      errors.push(`maxInstructions ${programming.maxInstructions} is below the minimum solution of ${min}`);
    }
    if (stars.budget !== undefined && stars.budget < min) {
      errors.push(`stars.budget ${stars.budget} is below the minimum solution of ${min}`);
    }
    if (open && refCount > min) {
      warnings.push(`referenceSolution has ${refCount} steps; the shortest has ${min}`);
    }
  } else {
    // With blocks there is no exhaustive search; the reference solution is the proof.
    if (stars.budget !== undefined && stars.budget < refCount) {
      errors.push(`stars.budget ${stars.budget} is below the referenceSolution's ${refCount} cards, so nothing proves it can be met`);
    }
    if (min !== null && withinQuotas && open && programming.maxInstructions !== undefined && programming.maxInstructions >= min) {
      warnings.push(`a flat program of ${min} commands fits under maxInstructions ${programming.maxInstructions}, so blocks are optional here`);
    }
    if (min !== null && withinQuotas && open && stars.budget !== undefined && stars.budget >= min) {
      warnings.push(`stars.budget ${stars.budget} can be met by a flat program of ${min} commands, so the star does not need a block`);
    }
  }

  return { errors, warnings, minInstructions: min };
}

/**
 * Functions are the level's to name: the starter program defines them (empty
 * on a build level) and the reference solution fills the same ones in. Calls
 * name a defined function and sit in main, since a function cannot use a
 * function yet.
 */
function validateFunctions(puzzle: PuzzleDefinition, errors: string[]): void {
  const { programming, referenceSolution } = puzzle;
  const starter = splitSpec(programming.starterProgram);
  const reference = splitSpec(referenceSolution);
  const names = starter.functions.map((f) => f.name);
  const refNames = reference.functions.map((f) => f.name);
  if (names.join(',') !== refNames.join(',')) {
    errors.push(`starterProgram defines ${names.join(', ') || 'no functions'} but referenceSolution defines ${refNames.join(', ') || 'none'}; they must define the same functions in the same order`);
  }
  const callAllowed = programming.allowedCommands.includes('call');
  if (callAllowed && names.length === 0) errors.push('call is allowed, but the starterProgram defines no function to call');
  if (!callAllowed && names.length > 0) errors.push('the starterProgram defines a function, but call is not allowed');
  for (const [label, split] of [['starterProgram', starter], ['referenceSolution', reference]] as const) {
    const defined = new Set(split.functions.map((f) => f.name));
    for (const name of callsOfSpec(split.main)) {
      if (!defined.has(name)) errors.push(`${label} calls ${name}, which it does not define`);
    }
    for (const f of split.functions) {
      if (callsOfSpec(f.body).length > 0) errors.push(`${label}: function ${f.name} uses a call, but a function cannot use a function yet`);
    }
  }
  if (callAllowed && puzzle.curriculum.activity !== 'run' && puzzle.curriculum.activity !== 'predict' && callsOfSpec(reference.main).length === 0) {
    errors.push('referenceSolution never calls its function');
  }
}

/**
 * When cards are the level's to choose, like functions: the starter program
 * lists them (empty on a build level) and the solution fills the same ones
 * in. Each waits for something this board can do: a plate on it, an acorn
 * on it, a key in its script, or ticks. Gate cards name gates on the board.
 */
function validateHandlers(puzzle: PuzzleDefinition, errors: string[]): void {
  const { programming, referenceSolution, world, inputScript } = puzzle;
  const events = splitSpec(programming.starterProgram).handlers.map((h) => h.event);
  const refEvents = splitSpec(referenceSolution).handlers.map((h) => h.event);
  if (events.join(',') !== refEvents.join(',')) {
    errors.push(`starterProgram has When cards for ${events.join(', ') || 'nothing'} but referenceSolution for ${refEvents.join(', ') || 'nothing'}; they must match, in the same order`);
  }
  for (const event of events) {
    const [kind, arg] = event.split(':');
    if (kind === 'stepOn' && !platesOf(world).some((p) => p.id === arg)) errors.push(`a When card waits for plate ${arg}, which is not on the board`);
    if (kind === 'acorn' && world.collectibles.length === 0) errors.push('a When card waits for an acorn, but the board has none');
    if (kind === 'key' && !inputScript?.includes(arg as Key)) errors.push(`a When card waits for the ${arg} key, which the inputScript never presses`);
  }
  if (inputScript !== undefined && inputScript.length === 0) errors.push('inputScript must press at least one key');
  const gates = new Set(gatesOf(world).map((g) => g.id));
  for (const [label, spec] of [['starterProgram', programming.starterProgram], ['referenceSolution', referenceSolution]] as const) {
    for (const g of gatesOfSpec(spec)) if (!gates.has(g)) errors.push(`${label} opens or shuts gate ${g}, which is not on the board`);
  }
}

/** Every value a spec's Set cards put in slots. */
function setSources(spec: readonly NodeSpec[]): Source[] {
  return spec.flatMap((s): Source[] => {
    if (typeof s === 'string') return [];
    const own = 'set' in s || 'push' in s ? [s.to] : [];
    return [...own, ...('do' in s ? setSources(s.do) : []), ...('if' in s && s.else ? setSources(s.else) : [])];
  });
}

/** What kind of value a Set card's source gives. */
function sourceKind(source: Source): ValueKind {
  if (typeof source === 'number' || source === 'acorns' || parseLength(source)) return 'number';
  if (typeof source === 'boolean' || isSenseId(source)) return 'yesNo';
  if (source === 'here') return 'position';
  return 'direction';
}

/** What kind of slot a memory test's value fits. */
function testKind(value: string): ValueKind {
  if (value === 'yes' || value === 'no') return 'yesNo';
  if (value === 'here') return 'position';
  if (/^\d+$/.test(value)) return 'number';
  return 'direction';
}

/** Every card that names a slot, and the kind it needs there, walking a spec. */
function slotUses(spec: readonly NodeSpec[]): { slot: string; kind: ValueKind | 'item'; card: string; list?: string; of?: ValueKind }[] {
  return spec.flatMap((s) => {
    if (typeof s === 'string') return [];
    const inner = 'do' in s ? [...slotUses(s.do), ...('if' in s && s.else ? slotUses(s.else) : [])] : [];
    const own: { slot: string; kind: ValueKind | 'item'; card: string; list?: string; of?: ValueKind }[] = [];
    if ('push' in s) own.push({ slot: s.push, kind: 'list', card: 'Add to list', of: sourceKind(s.to) });
    for (const to of 'set' in s ? [s.to] : 'push' in s ? [s.to] : []) {
      const counted = parseLength(to);
      if (counted) own.push({ slot: counted, kind: 'list', card: 'a length' });
    }
    const read = 'set' in s ? parseRead(s.to) : null;
    if ('set' in s && read) {
      own.push({ slot: s.set, kind: 'item', card: 'Set', list: read.grid }, { slot: read.grid, kind: 'grid', card: 'Set' });
      if (read.at !== 'here' && read.at !== 'ahead') own.push({ slot: read.at, kind: 'position', card: 'Set' });
    } else if ('set' in s) own.push({ slot: s.set, kind: sourceKind(s.to), card: 'Set' });
    if ('mark' in s) {
      own.push({ slot: s.mark, kind: 'grid', card: 'Mark' }, { slot: s.with, kind: 'item', card: 'Mark', list: s.mark });
      if (s.at !== 'here' && s.at !== 'ahead') own.push({ slot: s.at, kind: 'position', card: 'Mark' });
    }
    if ('change' in s) own.push({ slot: s.change, kind: 'number', card: 'Add' });
    if ('face' in s) own.push({ slot: s.face, kind: 'direction', card: 'Face' });
    if ('unlock' in s) own.push({ slot: s.with, kind: 'number', card: 'Unlock' });
    if ('forEach' in s) own.push({ slot: s.forEach, kind: 'list', card: 'For each' }, { slot: s.as, kind: 'item', card: 'For each', list: s.forEach });
    for (const c of 'if' in s ? [s.if] : 'until' in s ? [s.until] : []) {
      const t = parseSlotTest(c);
      if (t) own.push({ slot: t.slot, kind: testKind(t.value), card: 'a check' });
    }
    return [...own, ...inner];
  });
}

/**
 * The robot's memory: slots hold one kind of value each, every card that
 * names a slot names one the program has and puts the right kind of value
 * in it, and the program keeps no more slots than the budget allows. A
 * level that offers slots to choose from lets the solution pick its own;
 * otherwise the starter's slots are the solution's.
 */
function validateMemory(puzzle: PuzzleDefinition, errors: string[]): void {
  const { programming, referenceSolution, world } = puzzle;
  const options = programming.memoryOptions;
  for (const [label, spec] of [['starterProgram', programming.starterProgram], ['referenceSolution', referenceSolution]] as const) {
    const { memory, functions } = splitSpec(spec);
    const names = memory.map((m) => m.name);
    if (new Set(names).size !== names.length) errors.push(`${label} remembers the same slot name twice`);
    for (const m of memory) {
      if (functions.some((f) => f.name === m.name)) errors.push(`${label}: slot ${m.name} has the same name as a function`);
      if (!valueFits(m.start, m.kind, m.of)) errors.push(`${label}: slot ${m.name} starts with a value that is not a ${m.kind}`);
      if (options && !options.some((o) => o.name === m.name && o.kind === m.kind)) errors.push(`${label} remembers ${m.name}, which is not one of the memoryOptions`);
    }
    if (programming.maxMemory !== undefined && memory.length > programming.maxMemory) errors.push(`${label} keeps ${memory.length} slots, over the memory budget of ${programming.maxMemory}`);
    const byName = new Map(memory.map((m) => [m.name, m]));
    for (const use of slotUses(spec)) {
      const slot = byName.get(use.slot);
      if (!slot) {
        errors.push(`${label}: ${use.card} uses ${use.slot}, which the robot does not remember`);
        continue;
      }
      const want = use.kind === 'item' ? byName.get(use.list ?? '')?.of : use.kind;
      if (want !== undefined && slot.kind !== want) errors.push(`${label}: ${use.card} needs ${use.slot} to hold a ${want}, but it holds a ${slot.kind}`);
      else if (use.of && slot.of !== use.of) errors.push(`${label}: ${use.card} puts a ${use.of} in ${use.slot}, a list of ${slot.of}`);
    }
    if (programming.allowedSources) {
      const allowed = new Set(programming.allowedSources.map((x) => JSON.stringify(x)));
      for (const to of setSources(spec)) if (!allowed.has(JSON.stringify(to))) errors.push(`${label} sets a slot to ${JSON.stringify(to)}, which allowedSources does not offer`);
    }
    for (const g of gatesOfSpec(spec)) {
      const gate = gatesOf(world).find((x) => x.id === g);
      if (gate && gate.code === undefined && JSON.stringify(spec).includes(`"unlock":"${g}"`)) errors.push(`${label} unlocks gate ${g}, which has no number lock`);
    }
  }
  // An answer in memory: the solution's slots, and values of their kinds. Grids are the board's size.
  const refMemory = splitSpec(referenceSolution).memory;
  for (const [slot, want] of Object.entries(puzzle.objective.memory ?? {})) {
    const m = refMemory.find((x) => x.name === slot);
    if (!m) errors.push(`objective.memory asks for ${slot}, which the referenceSolution does not remember`);
    else if (!valueFits(want, m.kind, m.of)) errors.push(`objective.memory gives ${slot} a value that is not a ${m.kind}`);
  }
  for (const m of [...splitSpec(programming.starterProgram).memory, ...refMemory, ...(options ?? [])]) {
    if (m.kind === 'grid' && Array.isArray(m.start) && (m.start.length !== world.height || (m.start[0] as unknown[]).length !== world.width)) {
      errors.push(`grid ${m.name} is ${(m.start[0] as unknown[]).length} by ${m.start.length}; it must be the board's ${world.width} by ${world.height}`);
    }
  }
  if (!options) {
    const a = JSON.stringify(splitSpec(programming.starterProgram).memory);
    const b = JSON.stringify(splitSpec(referenceSolution).memory);
    if (a !== b) errors.push('starterProgram and referenceSolution must remember the same slots, unless the level offers memoryOptions');
  }
  if (options && programming.maxMemory === undefined) errors.push('memoryOptions need a maxMemory budget to choose under');
}

const multiset = (cards: readonly string[]) => [...cards].sort().join(',');

/** Each activity makes its own promises about the starter program and cards. */
function validateActivity(puzzle: PuzzleDefinition, errors: string[]): void {
  const { programming, referenceSolution, curriculum, prediction } = puzzle;
  const starter = programming.starterProgram;
  switch (curriculum.activity) {
    case 'run':
    case 'predict':
    case 'model':
      if (!solves(puzzle, starter)) errors.push(`a ${curriculum.activity} level's starterProgram must already solve the level`);
      if (!prediction) errors.push(`a ${curriculum.activity} level must set prediction`);
      if (curriculum.activity === 'model' && !prediction?.askMemory?.length) errors.push('a model level must ask for at least one memory card field');
      if (curriculum.activity === 'predict' && prediction && !prediction.askTile) errors.push('a predict level must ask for the tile');
      break;
    case 'reorder':
      if (!programming.suppliedCards) errors.push('a reorder level must list suppliedCards');
      else if (multiset(programming.suppliedCards) !== multiset(cardsOfSpec(referenceSolution))) {
        errors.push('suppliedCards must be exactly the cards of referenceSolution, in any order');
      }
      // Functions are the level's to name, so they are there from the start, but empty.
      if (cardsOfSpec(starter).length > 0) errors.push('a reorder level starts with an empty program');
      break;
    case 'debug': {
      if (starter.length === 0) errors.push('a debug level needs a starterProgram to repair');
      if (solves(puzzle, starter)) errors.push("a debug level's starterProgram must not already solve the level");
      if (specDiff(starter, referenceSolution) !== 1) errors.push("a debug level's starterProgram must differ from referenceSolution in exactly one card, count or condition");
      break;
    }
    case 'build':
      if (solves(puzzle, starter)) errors.push("a build level's starterProgram must not already solve the level");
      break;
  }
  if (prediction && !prediction.askTile && !prediction.askMemory?.length) errors.push('prediction must ask for the tile or a memory card field');
  const asked = prediction?.askMemory ?? [];
  if (new Set(asked).size !== asked.length) errors.push('prediction.askMemory must not repeat a field');
  asked.forEach((f) => {
    if (!hasField(puzzle.world, f, splitSpec(programming.starterProgram).memory)) errors.push(`prediction asks for ${f}, which this board's memory card does not have`);
  });
}

/** Hint targets must refer to real tiles, cards and steps. */
function validateHints(puzzle: PuzzleDefinition, errors: string[]): void {
  const { hints, world, programming, referenceSolution } = puzzle;
  const kinds = hints.map((h) => h.kind);
  if (kinds[0] !== 'region') errors.push('hints[0] must orient attention: kind "region"');
  if (kinds[1] !== 'card' && kinds[1] !== 'step') errors.push('hints[1] must identify a card or a step: kind "card" or "step"');
  if (kinds[2] !== 'fill') errors.push('hints[2] must fill one slot: kind "fill"');
  const allowed = new Set<CardId>(programming.allowedCommands);
  hints.forEach((h, i) => {
    switch (h.kind) {
      case 'region':
        h.cells.forEach((c) => {
          if (tileAt(world, c) === 'outside') errors.push(`hints[${i}] points at ${cellKey(c)}, which is off the board`);
        });
        break;
      case 'card':
        if (!allowed.has(h.command)) errors.push(`hints[${i}] names ${h.command}, which this level does not allow`);
        break;
      case 'step': {
        const cards = resolveSpecPath(programming.starterProgram, h.path);
        if (!cards) errors.push(`hints[${i}] follows path ${JSON.stringify(h.path)}, which the starter program does not have`);
        else if (h.index >= cards.length) errors.push(`hints[${i}] points at step ${h.index + 1}, but that part of the starter program has ${cards.length} steps`);
        break;
      }
      case 'fill': {
        const cards = resolveSpecPath(referenceSolution, h.path);
        if (!cards) {
          errors.push(`hints[${i}] follows path ${JSON.stringify(h.path)}, which the reference solution does not have`);
        } else {
          const there = cards[h.slot];
          if (there === undefined || cardOfSpec(there) !== h.command) {
            errors.push(`hints[${i}] fills slot ${h.slot} with ${h.command}, but the reference solution has ${there === undefined ? 'nothing' : cardOfSpec(there)} there`);
          }
        }
        break;
      }
    }
  });
}

/**
 * The concept graph across packs: prerequisites name real packs that come
 * earlier, an introduction belongs to one of the pack's own concepts, and
 * its demo truly shows the idea.
 */
export function validatePack(pack: PackManifest, all: readonly PackManifest[]): string[] {
  const errors: string[] = [];
  const byId = new Map(all.map((p) => [p.id, p]));
  const ids = pack.concepts;
  if (new Set(ids).size !== ids.length) errors.push('concepts must not repeat');
  for (const pre of pack.prerequisites) {
    const other = byId.get(pre);
    if (!other) errors.push(`prerequisite "${pre}" is not a pack`);
    else if (other.id === pack.id) errors.push('a pack cannot be its own prerequisite');
    else if (other.order > pack.order || (other.order === pack.order && all.indexOf(other) > all.indexOf(pack))) {
      errors.push(`prerequisite "${pre}" plays after this pack on the map`);
    }
  }
  if (pack.introduction) {
    if (!pack.concepts.includes(pack.introduction.concept)) {
      errors.push(`introduction is for "${pack.introduction.concept}", which is not one of this pack's concepts`);
    }
    validateIntroduction(pack.introduction, errors);
  }
  return errors;
}

/** The demo must reach the flag and must use a card that belongs to the concept it introduces. */
export function validateIntroduction(intro: ConceptIntroduction, errors: string[]): void {
  const { world, program, before, input } = intro.demo;
  const objective: ObjectiveDefinition = { reachGoal: true, collectAll: world.collectibles.length > 0 };
  (intro.demo.shuffles ?? []).forEach((w, i) => {
    if (!solvesOn(w, { reachGoal: true, collectAll: w.collectibles.length > 0 }, program, input)) errors.push(`introduction.demo.program must reach the flag on shuffles[${i}] too`);
  });
  validateWorld(world, objective, errors, cardsOfSpec(program).some(isGateActionId));
  if (program.length === 0) errors.push('introduction.demo.program must not be empty');
  if (!solvesOn(world, objective, program, input)) errors.push('introduction.demo.program must reach the flag (and collect every acorn) on its board');
  if (before) {
    if (!solvesOn(world, objective, before, input)) errors.push('introduction.demo.before must reach the flag on its board too, the old way');
    if (countSpec(before) <= countSpec(program)) errors.push('introduction.demo.before should be the longer, old way; it has no more cards than the program');
  }
  // Concepts without a card of their own must show their idea in the run itself.
  const trace = runOn(world, objective, program, input).trace;
  const shows: Record<string, [boolean, string]> = {
    worldState: [trace.some((e) => e.result.kind === 'ok' && e.result.toggled), 'never steps on a switch'],
    events: [trace.some((e) => e.op === 'when' && !e.event.startsWith('key:') && e.event !== 'tick'), 'never sets off a When card'],
    input: [trace.some((e) => e.op === 'press' && e.nodeId !== 'input'), 'never presses a key that a When card waits for'],
    time: [trace.some((e) => e.op === 'tick' && e.before.tick !== e.after.tick) && moversOf(world).length > 0, 'never lets anything move with the ticks'],
    representation: [splitSpec(program).memory.length > 0 && trace.some((e) => e.op === 'set'), 'never puts anything in a memory slot'],
    grids: [splitSpec(program).memory.some((m) => m.kind === 'grid'), 'never uses a grid'],
    randomness: [(intro.demo.shuffles?.length ?? 0) >= 2, 'has fewer than two shuffles to play on'],
  };
  const check = shows[intro.concept];
  if (check && !check[0]) errors.push(`introduction.demo.program ${check[1]}, so it does not show "${intro.concept}"`);
  const teaching = cardsTeaching(intro.concept);
  if (teaching && !cardsOfSpec(program).some((c) => teaching.includes(c as CardId))) {
    errors.push(`introduction.demo.program never uses a ${teaching.join(' or ')} card, so it does not show "${intro.concept}"`);
  }
}
