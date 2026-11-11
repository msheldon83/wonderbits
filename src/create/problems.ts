/**
 * The board checker: what is wrong with a board, said to the child who is
 * building it, with the tiles to look at. The editing operations already
 * keep a board runnable; these are the problems they cannot rule out. It
 * only says what is true. It never changes the board.
 */
import { isGateActionId, type CardId } from '../ir/types';
import type { Cell, ObjectiveDefinition, WorldDefinition } from '../sim/types';

export interface BoardProblem {
  text: string;
  cells: Cell[];
}

const key = (c: Cell) => `${c.x},${c.y}`;

/** Every tile a robot could ever walk to from a start: over floor, through gates, and across water a log floats on. */
export function reachable(world: WorldDefinition, from: Cell): Set<string> {
  const rides = new Set((world.movers ?? []).filter((m) => m.kind === 'log').flatMap((m) => m.path.map(key)));
  const open = (c: Cell) => {
    const t = world.tiles[c.y]?.[c.x];
    return t === 'floor' || (t === 'gap' && rides.has(key(c)));
  };
  const seen = new Set([key(from)]);
  const queue = [from];
  for (let c = queue.shift(); c; c = queue.shift()) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!seen.has(key(n)) && open(n)) {
        seen.add(key(n));
        queue.push(n);
      }
    }
  }
  return seen;
}

export function boardProblems(world: WorldDefinition, objective: ObjectiveDefinition, cards: readonly CardId[] = []): BoardProblem[] {
  const problems: BoardProblem[] = [];
  const robots = world.team ? world.team.map((t, i) => ({ start: t.robot, goal: t.goal, name: `Robot ${i + 1}` })) : [{ start: world.robot, goal: world.goal, name: 'The robot' }];
  if (objective.reachGoal) {
    for (const r of robots) {
      if (!reachable(world, r.start).has(key(r.goal))) problems.push({ text: `${r.name} cannot walk to ${world.team ? 'its' : 'the'} flag. Rocks or water are in the way.`, cells: [r.goal] });
    }
  }
  if (objective.collectAll) {
    if (world.collectibles.length === 0) problems.push({ text: 'There are no acorns to collect yet. Put one on the island.', cells: [] });
    const within = new Set(robots.flatMap((r) => [...reachable(world, r.start)]));
    const far = world.collectibles.filter((c) => !within.has(key(c)));
    if (far.length > 0) problems.push({ text: far.length === 1 ? 'The robot cannot walk to one of the acorns.' : `The robot cannot walk to ${far.length} of the acorns.`, cells: far });
  }
  // A gate nothing can open stays as it starts. Cards that open gates count as a way.
  const gateCards = cards.some((c) => isGateActionId(c) || c === 'unlock');
  if (!gateCards) {
    for (const g of world.gates ?? []) {
      if (g.code !== undefined || g.open) continue;
      if (!(world.switches ?? []).some((s) => s.toggles.includes(g.id))) problems.push({ text: `Gate ${g.id.toUpperCase()} has no switch, so it can never open. Put a switch on the island for it.`, cells: [{ x: g.x, y: g.y }] });
    }
  }
  return problems;
}
