// A place on the board: its column (x) and its row (y), both counted from 0.
export interface Place {
  x: number;
  y: number;
}

// In the grid of what is shown, 9 means a tile is still covered.
// Any other number is uncovered, and says how many mines touch that tile.
export const COVERED = 9;

// How many mines touch a tile? Look at all eight tiles around it and count.
export function minesAround(mines: boolean[][], at: Place): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      // Skip the tile itself.
      if (dx === 0 && dy === 0) continue;
      // A tile off the edge of the board has no mine.
      if (mines[at.y + dy]?.[at.x + dx] === true) count = count + 1;
    }
  }
  return count;
}

// UNCOVER: open a tile, and if no mine touches it, open the tiles around it too,
// and the tiles around those, until every edge of the open patch has a number.
// Returns the new grid of what is shown. A tile with a mine is never opened.
export function uncover(shown: number[][], mines: boolean[][], at: Place): number[][] {
  // Copy the grid, so the old one is left as it was.
  const next = shown.map((row) => [...row]);
  // The tiles still to open. It starts with the one that was tapped.
  const toOpen = [at];

  while (toOpen.length > 0) {
    const here = toOpen.pop()!;
    // Off the board, already open, or a mine: nothing to do.
    if (next[here.y]?.[here.x] !== COVERED) continue;
    if (mines[here.y]![here.x]) continue;

    const count = minesAround(mines, here);
    next[here.y]![here.x] = count;

    // No mine touches this tile, so every tile around it is safe: open those too.
    if (count === 0) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          toOpen.push({ x: here.x + dx, y: here.y + dy });
        }
      }
    }
  }
  return next;
}
