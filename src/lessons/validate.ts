/**
 * Level validator. Every level must prove it is solvable within its own
 * limits before it ships; CI runs this over all content.
 */
import { sequentialIdFactory } from '../ir/ids';
import { programFromCommands } from '../ir/program';
import type { CommandId } from '../ir/types';
import { interpretAll } from '../runtime/interpreter';
import { cellKey, objectiveMet, step, tileAt } from '../sim/world';
import type { SimState } from '../sim/types';
import type { PuzzleDefinition } from './types';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  /** Shortest program that meets the objective, ignoring per-command quotas. */
  minInstructions: number | null;
}

const SEARCH_CAP = 24;

/** Breadth-first search over robot states for the shortest solving program. */
export function shortestSolution(puzzle: PuzzleDefinition, cap = SEARCH_CAP): CommandId[] | null {
  const { world, objective, programming } = puzzle;
  const keyOf = (s: SimState) => `${s.robot.x},${s.robot.y},${s.robot.facing}|${[...s.collected].sort().join(';')}`;
  const start: SimState = { robot: { ...world.robot }, collected: [] };
  if (objectiveMet(world, objective, start)) return [];
  let frontier: { state: SimState; path: CommandId[] }[] = [{ state: start, path: [] }];
  const seen = new Set([keyOf(start)]);
  for (let depth = 1; depth <= cap && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { state, path } of frontier) {
      for (const cmd of programming.allowedCommands) {
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

function countOf(cmds: CommandId[], c: CommandId): number {
  return cmds.filter((x) => x === c).length;
}

export function validatePuzzle(puzzle: PuzzleDefinition): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { world, programming, referenceSolution, stars } = puzzle;

  if (world.width < 1 || world.width > 16 || world.height < 1 || world.height > 16) {
    errors.push(`board must be 1..16 tiles on each side, got ${world.width}x${world.height}`);
  }
  if (tileAt(world, world.robot) !== 'floor') errors.push('robot must start on a floor tile');
  if (puzzle.objective.reachGoal && tileAt(world, world.goal) !== 'floor') errors.push('goal must be on a floor tile');
  if (cellKey(world.robot) === cellKey(world.goal)) errors.push('robot must not start on the goal');
  const keys = world.collectibles.map(cellKey);
  if (new Set(keys).size !== keys.length) errors.push('collectibles must not share a tile');
  world.collectibles.forEach((c) => {
    if (tileAt(world, c) !== 'floor') errors.push(`collectible at ${cellKey(c)} must be on a floor tile`);
  });
  if (!puzzle.objective.reachGoal && !puzzle.objective.collectAll) errors.push('objective must ask for something');

  if (programming.allowedCommands.length === 0) errors.push('allowedCommands must not be empty');
  const allowed = new Set(programming.allowedCommands);
  const checkList = (name: string, cmds: CommandId[]) => {
    cmds.forEach((c, i) => {
      if (!allowed.has(c)) errors.push(`${name}[${i}] uses ${c}, which this level does not allow`);
    });
    if (programming.maxInstructions !== undefined && cmds.length > programming.maxInstructions) {
      errors.push(`${name} has ${cmds.length} steps, over the limit of ${programming.maxInstructions}`);
    }
    for (const [c, max] of Object.entries(programming.maxPerCommand ?? {})) {
      if (countOf(cmds, c as CommandId) > max!) errors.push(`${name} uses ${c} more than ${max} times`);
    }
  };
  checkList('starterProgram', programming.starterProgram);
  checkList('referenceSolution', referenceSolution);
  if (programming.suppliedCards) checkList('suppliedCards', programming.suppliedCards);

  const ref = interpretAll({
    program: programFromCommands(referenceSolution, sequentialIdFactory()),
    world,
    objective: puzzle.objective,
    limits: { maxSteps: 1000 },
  });
  if (ref.outcome.status !== 'success') {
    errors.push(`referenceSolution does not solve the level (outcome: ${ref.outcome.status})`);
  }

  const shortest = shortestSolution(puzzle);
  const min = shortest?.length ?? null;
  if (min === null) {
    errors.push(`no solution of ${SEARCH_CAP} steps or fewer exists`);
  } else {
    if (programming.maxInstructions !== undefined && programming.maxInstructions < min) {
      errors.push(`maxInstructions ${programming.maxInstructions} is below the minimum solution of ${min}`);
    }
    if (stars.budget !== undefined && stars.budget < min) {
      errors.push(`stars.budget ${stars.budget} is below the minimum solution of ${min}`);
    }
    if (referenceSolution.length > min) {
      warnings.push(`referenceSolution has ${referenceSolution.length} steps; the shortest has ${min}`);
    }
  }

  return { errors, warnings, minInstructions: min };
}
