// A grid is a list of rows, and each row is a list of tiles.
// A tile holds a number: 0 for empty, 1 for player 1's piece, 2 for player 2's.
export type Grid = number[][];

// The four ways a line can run from a tile: across, down, and the two slants.
// Each is how far to step along the row (x) and down the rows (y) to reach the next tile.
const WAYS = [
  { x: 1, y: 0 }, // across
  { x: 0, y: 1 }, // down
  { x: 1, y: 1 }, // slanting down
  { x: 1, y: -1 }, // slanting up
];

// Which player has `count` pieces in a row? Returns 1 or 2, or 0 if nobody has.
export function lineOf(grid: Grid, count: number): number {
  // Try every tile as the start of a line.
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      const piece = grid[y]![x]!;
      // An empty tile cannot start a line.
      if (piece === 0) continue;

      // From this tile, look each of the four ways.
      for (const way of WAYS) {
        // Count how many tiles in a row hold the same piece.
        let length = 1;
        while (length < count && grid[y + way.y * length]?.[x + way.x * length] === piece) {
          length = length + 1;
        }
        // Enough of them: this player has a line.
        if (length === count) return piece;
      }
    }
  }
  // Every tile tried, and no line anywhere.
  return 0;
}
