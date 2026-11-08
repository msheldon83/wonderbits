/**
 * Level validator. Every level must prove it is solvable within its own
 * limits before it ships; CI runs this over all content.
 */
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import { callsOfSpec, cardsOfSpec, conditionsOfSpec, countSpec, depthOfSpec, specDiff, splitSpec, type NodeSpec } from '../ir/spec';
import { CONDITION_IDS, isBlockId, isCommandId, type CardId, type CommandId } from '../ir/types';
import { interpretAll } from '../runtime/interpreter';
import { cellKey, objectiveMet, step, tileAt } from '../sim/world';
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
  const keyOf = (s: SimState) => `${s.robot.x},${s.robot.y},${s.robot.facing}|${[...s.collected].sort().join(';')}`;
  const start: SimState = { robot: { ...world.robot }, collected: [] };
  if (objectiveMet(world, objective, start)) return [];
  let frontier: { state: SimState; path: CommandId[] }[] = [{ state: start, path: [] }];
  const seen = new Set([keyOf(start)]);
  for (let depth = 1; depth <= cap && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { state, path } of frontier) {
      for (const cmd of commands) {
        const r = step(world, state, cmd);
        if (r.kind !== 'ok') continue;
        const k = keyOf(r.state);
        if (seen.has(k)) continue;
        seen.add(k);
        const p = [...path, cmd];
        if (objectiveMet(world, objective, r.state)) return p;
        next.push({ state: r.state, path: p });
      }
    }
    frontier = next;
  }
  return null;
}

function countOf(cards: readonly string[], c: string): number {
  return cards.filter((x) => x === c).length;
}

const solvesOn = (world: WorldDefinition, objective: ObjectiveDefinition, spec: NodeSpec[]) =>
  interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world, objective, limits: { maxSteps: 1000 } }).outcome.status === 'success';
const solves = (puzzle: PuzzleDefinition, spec: NodeSpec[]) => solvesOn(puzzle.world, puzzle.objective, spec);

/** The board itself: size, and the robot, goal and acorns on floor tiles. Shared by levels and demos. */
function validateWorld(world: WorldDefinition, objective: ObjectiveDefinition, errors: string[]): void {
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
}

export function validatePuzzle(puzzle: PuzzleDefinition): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { world, programming, referenceSolution, stars } = puzzle;

  validateWorld(world, puzzle.objective, errors);

  if (programming.allowedCommands.length === 0) errors.push('allowedCommands must not be empty');
  const allowed = new Set<string>(programming.allowedCommands);
  const conditions = new Set<string>(programming.allowedConditions ?? CONDITION_IDS);
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

  if (!solves(puzzle, referenceSolution)) {
    const outcome = interpretAll({ program: programFromSpec(referenceSolution, sequentialIdFactory()), world, objective: puzzle.objective, limits: { maxSteps: 1000 } }).outcome;
    errors.push(`referenceSolution does not solve the level (outcome: ${outcome.status})`);
  }

  validateFunctions(puzzle, errors);
  validateActivity(puzzle, errors);
  validateHints(puzzle, errors);

  const structured = programming.allowedCommands.some((c) => isBlockId(c) || c === 'call');
  /** Levels where the child writes the program; elsewhere a shorter flat program is no concern. */
  const open = puzzle.curriculum.activity === 'build' || puzzle.curriculum.activity === 'reorder';
  const refCount = countSpec(referenceSolution);
  const shortest = shortestSolution(puzzle);
  const min = shortest?.length ?? null;
  if (min === null) {
    errors.push(`no solution of ${SEARCH_CAP} commands or fewer exists`);
  } else if (!structured) {
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
    if (open && programming.maxInstructions !== undefined && programming.maxInstructions >= min) {
      warnings.push(`a flat program of ${min} commands fits under maxInstructions ${programming.maxInstructions}, so blocks are optional here`);
    }
    if (open && stars.budget !== undefined && stars.budget >= min) {
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

const multiset = (cards: readonly string[]) => [...cards].sort().join(',');

/** Each activity makes its own promises about the starter program and cards. */
function validateActivity(puzzle: PuzzleDefinition, errors: string[]): void {
  const { programming, referenceSolution, curriculum, prediction } = puzzle;
  const starter = programming.starterProgram;
  switch (curriculum.activity) {
    case 'run':
    case 'predict':
      if (!solves(puzzle, starter)) errors.push(`a ${curriculum.activity} level's starterProgram must already solve the level`);
      if (!prediction) errors.push(`a ${curriculum.activity} level must set prediction`);
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
  if (prediction && !prediction.askTile) errors.push('prediction must ask for the tile');
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
  const { world, program, before } = intro.demo;
  const objective: ObjectiveDefinition = { reachGoal: true, collectAll: world.collectibles.length > 0 };
  validateWorld(world, objective, errors);
  if (program.length === 0) errors.push('introduction.demo.program must not be empty');
  if (!solvesOn(world, objective, program)) errors.push('introduction.demo.program must reach the flag (and collect every acorn) on its board');
  if (before) {
    if (!solvesOn(world, objective, before)) errors.push('introduction.demo.before must reach the flag on its board too, the old way');
    if (countSpec(before) <= countSpec(program)) errors.push('introduction.demo.before should be the longer, old way; it has no more cards than the program');
  }
  const teaching = cardsTeaching(intro.concept);
  if (teaching && !cardsOfSpec(program).some((c) => teaching.includes(c as CardId))) {
    errors.push(`introduction.demo.program never uses a ${teaching.join(' or ')} card, so it does not show "${intro.concept}"`);
  }
}
