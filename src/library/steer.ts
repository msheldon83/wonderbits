// A place on the board: its column (x) and its row (y), both counted from 0.
export interface Place {
  x: number;
  y: number;
}

// The four tiles next to a place: up, right, down, left.
function neighbours(place: Place): Place[] {
  return [
    { x: place.x, y: place.y - 1 },
    { x: place.x + 1, y: place.y },
    { x: place.x, y: place.y + 1 },
    { x: place.x - 1, y: place.y },
  ];
}

const name = (place: Place) => `${place.x},${place.y}`;

// How many steps is every tile from `target`, walking only where `canWalk` says yes?
// This spreads out from the target like ripples: the target is 0 steps away,
// the tiles next to it are 1, the tiles next to those are 2, and so on.
export function stepsFrom(target: Place, canWalk: (place: Place) => boolean): Map<string, number> {
  const steps = new Map([[name(target), 0]]);
  const toVisit = [target];
  while (toVisit.length > 0) {
    const here = toVisit.shift()!;
    for (const next of neighbours(here)) {
      // Skip a tile we have already counted, or one nobody can walk on.
      if (steps.has(name(next)) || !canWalk(next)) continue;
      steps.set(name(next), steps.get(name(here))! + 1);
      toVisit.push(next);
    }
  }
  return steps;
}

// CHASE: the one step that brings the chaser closest to the target.
// It counts the steps from the target to every tile, then picks the tile
// beside the chaser with the smallest count. That is the shortest way round
// rocks and water. With no way through, it stays where it is.
export function chase(from: Place, target: Place, canWalk: (place: Place) => boolean): Place {
  const steps = stepsFrom(target, canWalk);
  let best = from;
  let bestSteps = steps.get(name(from)) ?? Infinity;
  for (const next of neighbours(from)) {
    const count = steps.get(name(next));
    if (count !== undefined && count < bestSteps) {
      best = next;
      bestSteps = count;
    }
  }
  return best;
}

// FLEE: the one step that takes the runner farthest from the target.
// The same counting as chase, but it picks the largest count instead.
export function flee(from: Place, target: Place, canWalk: (place: Place) => boolean): Place {
  const steps = stepsFrom(target, canWalk);
  let best = from;
  let bestSteps = steps.get(name(from)) ?? -1;
  for (const next of neighbours(from)) {
    const count = steps.get(name(next));
    if (count !== undefined && count > bestSteps) {
      best = next;
      bestSteps = count;
    }
  }
  return best;
}

// WANDER: a step to any tile beside it that can be walked on, chosen by `roll`,
// a number from 0 up to (but not including) 1. With nowhere to go, it stays.
export function wander(from: Place, canWalk: (place: Place) => boolean, roll: number): Place {
  const open = neighbours(from).filter(canWalk);
  if (open.length === 0) return from;
  return open[Math.floor(roll * open.length)]!;
}

// How often an enemy of each skill makes its best move. The rest of the time it wanders.
export const SKILL = { easy: 1 / 3, medium: 2 / 3, hard: 1 };

// One move of an enemy: its best move as often as its skill says, and a wander otherwise.
// `luck` and `roll` are two numbers from 0 up to 1, drawn fresh for every move.
export function steer(how: 'chase' | 'flee' | 'wander', skill: keyof typeof SKILL, from: Place, target: Place, canWalk: (place: Place) => boolean, luck: number, roll: number): Place {
  if (how === 'wander' || luck >= SKILL[skill]) return wander(from, canWalk, roll);
  return how === 'chase' ? chase(from, target, canWalk) : flee(from, target, canWalk);
}
